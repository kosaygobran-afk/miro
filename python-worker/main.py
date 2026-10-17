"""Private CPU background-removal worker. See docs/PRODUCT_IMAGE_BACKGROUND_REMOVAL.md."""

import base64
import hmac
import io
import logging
import os
from pathlib import Path
import threading
import warnings

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
import uvicorn

from platform_compat import install_runtime_stubs

install_runtime_stubs()

MODEL_NAME = "isnet-general-use"
# Vercel has a read-only deployment bundle and a small temporary disk. Ship the
# checksum-verified fixed weights at build time instead of downloading per cold start.
BUNDLED_MODELS = Path(__file__).resolve().parent / "models"
if (BUNDLED_MODELS / f"{MODEL_NAME}.onnx").is_file():
    os.environ["U2NET_HOME"] = str(BUNDLED_MODELS)
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 16_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
logger = logging.getLogger("rembg-worker")
logging.basicConfig(level=logging.INFO)
session = None
inference_lock = threading.Lock()


def decode_image(input_bytes: bytes) -> Image.Image:
    if not input_bytes or len(input_bytes) > MAX_BYTES:
        raise ValueError("Image must be between 1 byte and 5 MB")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(input_bytes)) as source:
            if source.format not in {"PNG", "JPEG", "WEBP", "AVIF"}:
                raise ValueError("Unsupported image format")
            if source.width * source.height > MAX_PIXELS or getattr(source, "n_frames", 1) > 1:
                raise ValueError("Only still images up to 16 megapixels are supported")
            source.load()
            # Normalize orientation before removing metadata from processed output.
            return ImageOps.exif_transpose(source).convert("RGBA")


def detect_transparency(input_bytes: bytes, transparency_ratio_threshold: float = 0.3) -> dict:
    image = decode_image(input_bytes)
    histogram = image.getchannel("A").histogram()
    pixels = image.width * image.height
    ratio = sum(histogram[:255]) / pixels
    genuine = ratio > transparency_ratio_threshold and sum(histogram[:128]) / pixels > 0.1
    return {
        "has_transparency": genuine,
        "transparency_ratio": ratio,
        "skip_reason": "image already has genuine transparency" if genuine else None,
        "mode": image.mode,
    }


def get_session():
    global session
    if session is None:
        import rembg
        logger.info("Loading model %s", MODEL_NAME)
        session = rembg.new_session(MODEL_NAME, providers=["CPUExecutionProvider"])
    return session


def remove_background(input_bytes: bytes) -> bytes:
    import rembg
    image = decode_image(input_bytes)
    # ISNet supplies a soft alpha mask; forced alpha matting can erase product edges.
    output = rembg.remove(image, session=get_session())
    if isinstance(output, bytes):
        output = decode_image(output)
    output = output.convert("RGBA")
    low, high = output.getchannel("A").getextrema()
    if low == 255 or high == 0:
        raise ValueError("Model did not produce a usable cutout")
    buf = io.BytesIO()
    output.save(buf, format="PNG")
    result = buf.getvalue()
    if len(result) > MAX_BYTES:
        raise ValueError("Processed image exceeds 5 MB")
    return result


class RequestSizeLimit:
    """Limit actual multipart bytes, including chunked requests, before parsing."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > MAX_BYTES + 64 * 1024:
                raise HTTPException(status_code=413, detail="Request exceeds image size limit")
            return message

        await self.app(scope, limited_receive, send)


app = FastAPI(title="MIRO Background Removal Worker", docs_url=None, redoc_url=None)
app.add_middleware(RequestSizeLimit)


@app.get("/health")
def health_check():
    return {
        "status": "healthy" if os.getenv("BACKGROUND_REMOVAL_WORKER_TOKEN") else "unconfigured",
        "model": MODEL_NAME,
        "model_loaded": session is not None,
    }


@app.post("/remove-background")
def remove_background_endpoint(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    token = os.getenv("BACKGROUND_REMOVAL_WORKER_TOKEN", "")
    if not token:
        raise HTTPException(status_code=503, detail="Worker authentication is not configured")
    if not hmac.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Do not queue expensive native inference or initialize the session concurrently.
    # Synchronous endpoints run off the event loop, keeping /health responsive.
    if not inference_lock.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="Worker busy")
    try:
        input_bytes = file.file.read(MAX_BYTES + 1)
        detection = detect_transparency(input_bytes)
        skipped = detection["has_transparency"]
        output = input_bytes if skipped else remove_background(input_bytes)
        return {
            "skipped": skipped,
            "reason": detection["skip_reason"],
            "image_base64": base64.b64encode(output).decode("ascii"),
            "mode": detection["mode"] if skipped else "processed",
        }
    except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        logger.exception("Image processing rejected (%s)", type(error).__name__)
        raise HTTPException(status_code=400, detail="Invalid image or unusable cutout") from None
    except Exception:
        logger.error("Background removal failed")
        raise HTTPException(status_code=503, detail="Image processing unavailable") from None
    finally:
        file.file.close()
        inference_lock.release()


if __name__ == "__main__":
    uvicorn.run(app, host=os.getenv("WORKER_HOST", "127.0.0.1"), port=int(os.getenv("WORKER_PORT", "8000")))
