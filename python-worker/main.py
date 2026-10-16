"""
Python background removal worker for Miro product images.

Uses Rembg with the isnet-general-use model (commercially permissible,
general-use model). The model is loaded once per process and reused
across requests for efficiency.

Endpoints:
  POST /remove-background - Remove background from image bytes
  GET /health - Health check
"""

import io
import os
import sys
import logging
import base64
from typing import Optional

import rembg
from PIL import Image
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("rembg-worker")

# Model configuration
MODEL_NAME = "isnet-general-use"
MODEL_DOWNLOADED = False

# Global session (loaded once)
session: Optional[object] = None


def get_session() -> object:
    """Get or create the global Rembg session with the selected model."""
    global session, MODEL_DOWNLOADED
    
    if session is None:
        logger.info(f"Loading Rembg model: {MODEL_NAME}")
        try:
            session = rembg.new_session(MODEL_NAME)
            MODEL_DOWNLOADED = True
            logger.info(f"Model {MODEL_NAME} loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model {MODEL_NAME}: {e}")
            raise RuntimeError(f"Could not initialize model {MODEL_NAME}: {e}")
    
    return session


def detect_transparency(
    input_bytes: bytes,
    transparency_ratio_threshold: float = 0.3,
    min_transparent_pixels: int = 30
) -> dict:
    """
    Detect whether an image has genuine, meaningful transparency.
    
    This is essential before running any AI inference. Simply testing whether
    a file is PNG, WebP, or RGBA is not sufficient.
    
    Returns dict with:
    - has_transparency: bool - whether the image has genuine transparency
    - transparency_ratio: float (0-1, ratio of transparent pixels below threshold)
    - skip_reason: str | None - reason if image should skip Rembg, None if not
    - mode: str - image mode description
    
    Logic:
    1. Decode and safely handle the image
    2. Apply EXIF orientation consideration (noted - handled upstream if needed)
    3. Inspect actual alpha values, not just file mode
    4. Distinguish genuine transparency from an alpha channel whose pixels
       are completely opaque
    5. Handle RGBA images, palette-based PNG transparency, and WebP transparency
    6. Identify tiny or accidental transparent artifacts conservatively
    7. If alpha channel exists but ALL pixels are fully opaque (alpha=255),
       the image is NOT transparent - run Rembg
    8. If very few transparent pixels (accidental artifacts), still run Rembg
    9. If meaningful transparency detected, skip Rembg entirely
    """
    try:
        img = Image.open(io.BytesIO(input_bytes))
        mode = img.mode
        
        # Initialize tracking variables
        has_alpha = False
        alpha_data = None
        transparent_pixel_count = 0  # pixels with alpha < 255
        total_pixels = 0
        very_transparent_count = 0   # pixels with alpha very low (0-127)
        
        # Handle different image modes
        if mode == "RGBA":
            has_alpha = True
            alpha = img.getchannel("A")
            alpha_data = alpha.getdata()
            total_pixels = img.width * img.height
            # Count pixels where alpha is not fully opaque
            transparent_pixel_count = sum(1 for a in alpha_data if a < 255)
            # Count very transparent pixels (alpha < 128)
            very_transparent_count = sum(1 for a in alpha_data if a < 128)
            
        elif mode == "LA":
            has_alpha = True
            alpha = img.getchannel("A")
            alpha_data = alpha.getdata()
            total_pixels = img.width * img.height
            transparent_pixel_count = sum(1 for a in alpha_data if a < 255)
            very_transparent_count = sum(1 for a in alpha_data if a < 128)
            
        elif mode == "RGB":
            # No alpha channel - fully opaque, run Rembg
            has_alpha = False
            transparent_pixel_count = 0
            very_transparent_count = 0
            total_pixels = img.width * img.height
            
        elif mode == "P":
            # Palette-based mode - check for transparency
            try:
                img_rgba = img.convert("RGBA")
                has_alpha = True
                alpha = img_rgba.getchannel("A")
                alpha_data = alpha.getdata()
                total_pixels = img_rgba.width * img_rgba.height
                transparent_pixel_count = sum(1 for a in alpha_data if a < 255)
                very_transparent_count = sum(1 for a in alpha_data if a < 128)
            except Exception:
                has_alpha = False
                transparent_pixel_count = 0
                very_transparent_count = 0
                total_pixels = 0
                
        elif mode == "1" or mode == "L":
            # Binary or grayscale - no alpha
            has_alpha = False
            transparent_pixel_count = 0
            very_transparent_count = 0
            total_pixels = img.width * img.height if hasattr(img, 'width') and hasattr(img, 'height') else 0
            
        else:
            # Try to convert and check
            try:
                img_rgba = img.convert("RGBA")
                has_alpha = True
                alpha = img_rgba.getchannel("A")
                alpha_data = alpha.getdata()
                total_pixels = img_rgba.width * img_rgba.height
                transparent_pixel_count = sum(1 for a in alpha_data if a < 255)
                very_transparent_count = sum(1 for a in alpha_data if a < 128)
            except Exception:
                has_alpha = False
                transparent_pixel_count = 0
                very_transparent_count = 0
                total_pixels = 0
        
        # Handle case where we couldn't get dimensions
        if total_pixels == 0:
            return {
                "has_transparency": False,
                "transparency_ratio": 0.0,
                "skip_reason": "Could not determine image dimensions",
                "mode": mode,
            }
        
        transparency_ratio = transparent_pixel_count / total_pixels
        very_transparent_ratio = very_transparent_count / total_pixels
        
        # --- Decision Logic ---
        
        # Case 1: No alpha channel - image is opaque, run Rembg
        if not has_alpha:
            return {
                "has_transparency": False,
                "transparency_ratio": transparency_ratio,
                "skip_reason": None,
                "mode": mode,
            }
        
        # Case 2: Alpha channel exists but ALL pixels are fully opaque (alpha=255)
        # This means the image looks opaque but has an alpha channel - run Rembg
        if transparent_pixel_count == 0:
            return {
                "has_transparency": False,
                "transparency_ratio": 0.0,
                "skip_reason": None,
                "mode": mode,
            }
        
        # Case 3: Very few transparent pixels (accidental artifacts or small area)
        # Be conservative: still run Rembg to avoid losing image data
        if transparency_ratio < 0.02:
            # Less than 2% transparent pixels - likely not a transparent background
            # But be conservative and run Rembg
            return {
                "has_transparency": False,
                "transparency_ratio": transparency_ratio,
                "skip_reason": None,
                "mode": mode,
            }
        
        # Case 4: Genuine transparency detected
        # Meaningful transparency: substantial portion of image has transparent pixels
        # and the transparency ratio exceeds the threshold
        if transparency_ratio > transparency_ratio_threshold:
            # Additional check: if very transparent ratio is also significant,
            # it's likely a genuine transparent background
            if very_transparent_ratio > 0.1:
                return {
                    "has_transparency": True,
                    "transparency_ratio": transparency_ratio,
                    "skip_reason": "image already has genuine transparency",
                    "mode": mode,
                }
            # Moderate transparency - conservative, run Rembg
            return {
                "has_transparency": False,
                "transparency_ratio": transparency_ratio,
                "skip_reason": None,
                "mode": mode,
            }
        
        # Case 5: Moderate transparency ratio but below threshold
        # Conservative: run Rembg to ensure proper background removal
        return {
            "has_transparency": False,
            "transparency_ratio": transparency_ratio,
            "skip_reason": None,
            "mode": mode,
        }
        
    except Exception as e:
        logger.warning(f"Transparency detection failed: {e}")
        # On error, conservatively run Rembg
        return {
            "has_transparency": False,
            "transparency_ratio": 0.0,
            "skip_reason": f"Detection error: {str(e)[:60]}",
            "mode": "error",
        }


def remove_background(input_bytes: bytes, timeout_ms: int = 30000) -> bytes:
    """
    Remove background from image bytes using Rembg.
    
    Returns the processed image bytes (PNG format with alpha channel).
    """
    try:
        session = get_session()
        
        # Run Rembg background removal with decontamination for cleaner edges
        output_bytes = rembg.remove(
            input_bytes,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=5,
        )
        
        # Verify output and ensure RGBA format
        output_img = Image.open(io.BytesIO(output_bytes))
        
        # Convert to RGBA if not already
        if output_img.mode != "RGBA":
            output_img = output_img.convert("RGBA")
        
        # Verify there's actual transparency in the output
        alpha = output_img.getchannel("A")
        alpha_data = alpha.getdata()
        non_zero_alpha = sum(1 for a in alpha_data if a > 0)
        total_alpha_pixels = alpha.width * alpha.height
        
        if non_zero_alpha < 10 and total_alpha_pixels > 10:
            logger.warning(
                "Background removal produced minimal transparency "
                f"({non_zero_alpha}/{total_alpha_pixels} non-zero alpha pixels)"
            )
        
        # Return as PNG
        buf = io.BytesIO()
        output_img.save(buf, format="PNG")
        result = buf.getvalue()
        
        logger.info(f"Background removal completed, output size: {len(result)} bytes")
        return result
        
    except Exception as e:
        logger.error(f"Background removal failed: {e}")
        raise


# Encode result as base64 for JSON serialization
def encode_result_base64(image_bytes: bytes) -> str:
    """Encode bytes as base64 for JSON-safe transmission."""
    return base64.b64encode(image_bytes).decode("ascii")


# FastAPI application
app = FastAPI(
    title="Miro Background Removal Worker",
    description="AI-powered background removal for product images using Rembg with isnet-general-use model",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model": MODEL_NAME,
        "model_loaded": MODEL_DOWNLOADED,
    }


@app.post("/remove-background")
async def remove_background_endpoint(
    file: UploadFile = File(...),
    timeout_ms: int = 30000,
):
    """
    Remove background from uploaded image.
    
    Workflow:
    1. Read uploaded file bytes
    2. Detect transparency
    3. If genuinely transparent, return original (skipped)
    4. Otherwise, run Rembg background removal
    5. Return result as base64-encoded PNG
    """
    try:
        # Read the uploaded file bytes
        input_bytes = await file.read()
        
        if not input_bytes:
            raise HTTPException(status_code=400, detail="Empty file")
        
        # Step 1: Detect transparency
        transparency_result = detect_transparency(input_bytes)
        
        if transparency_result["has_transparency"]:
            # Image already has genuine transparency - return original unchanged
            logger.info(
                f"Skipping Rembg: image already transparent "
                f"(ratio={transparency_result['transparency_ratio']:.2f})"
            )
            # Return original as base64-encoded PNG
            img = Image.open(io.BytesIO(input_bytes))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            encoded = encode_result_base64(buf.getvalue())
            return {
                "skipped": True,
                "reason": transparency_result["skip_reason"],
                "image_base64": encoded,
                "mode": transparency_result["mode"],
            }
        
        # Step 2: Run background removal
        result_bytes = remove_background(input_bytes, timeout_ms=timeout_ms)
        
        # Step 3: Encode result as base64 for JSON transmission
        encoded = encode_result_base64(result_bytes)
        
        logger.info(
            f"Background removal completed, output size: {len(result_bytes)} bytes"
        )
        
        return {
            "skipped": False,
            "reason": transparency_result["skip_reason"],
            "image_base64": encoded,
            "mode": "processed",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in remove-background: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def main():
    """Main entry point for the worker process."""
    host = os.getenv("WORKER_HOST", "0.0.0.0")
    port = int(os.getenv("WORKER_PORT", "8000"))
    logger.info(f"Starting background removal worker on {host}:{port}")
    logger.info(f"Using model: {MODEL_NAME}")
    
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    import os
    main()