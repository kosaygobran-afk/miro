import base64
import io
import os
import unittest
import threading
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
import main


def encoded(mode="RGBA", transparent=0, format="PNG"):
    image = Image.new(mode, (20, 20), (255, 255, 255, 255) if mode == "RGBA" else "white")
    if mode == "RGBA":
        for x in range(20):
            for y in range(transparent):
                image.putpixel((x, y), (0, 0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format=format)
    return buffer.getvalue()


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"BACKGROUND_REMOVAL_WORKER_TOKEN": "synthetic-token"})
        self.env.start()
        self.client = TestClient(main.app)
        self.headers = {"Authorization": "Bearer synthetic-token"}

    def tearDown(self):
        self.client.close()
        self.env.stop()

    def post(self, data, headers=None):
        return self.client.post("/remove-background", files={"file": ("image.png", data)}, headers=self.headers if headers is None else headers)

    def test_real_alpha_and_formats(self):
        for format in ["PNG", "WEBP"]:
            self.assertTrue(main.detect_transparency(encoded(transparent=15, format=format))["has_transparency"])
        self.assertFalse(main.detect_transparency(encoded())["has_transparency"])
        self.assertFalse(main.detect_transparency(encoded(mode="RGB", format="JPEG"))["has_transparency"])
        # RGB PNG tRNS transparency also counts after RGBA conversion.
        img = Image.new("RGB", (20, 20), "white")
        buf = io.BytesIO()
        img.save(buf, format="PNG", transparency=(255, 255, 255))
        self.assertTrue(main.detect_transparency(buf.getvalue())["has_transparency"])
        palette = Image.new("P", (20, 20))
        buf = io.BytesIO()
        palette.save(buf, format="PNG", transparency=0)
        self.assertTrue(main.detect_transparency(buf.getvalue())["has_transparency"])

    def test_skip_never_invokes_model_and_preserves_bytes(self):
        data = encoded(transparent=15, format="WEBP")
        with patch.object(main, "remove_background", side_effect=AssertionError("must skip")):
            response = self.post(data)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["skipped"])
        self.assertEqual(base64.b64decode(response.json()["image_base64"]), data)

    def test_opaque_calls_real_endpoint_processing_boundary(self):
        with patch.object(main, "remove_background", return_value=encoded(transparent=15)) as remove:
            response = self.post(encoded(mode="RGB", format="JPEG"))
        self.assertEqual(response.status_code, 200)
        remove.assert_called_once()
        self.assertFalse(response.json()["skipped"])
        self.assertEqual(response.json()["mode"], "processed")

    def test_invalid_auth_and_missing_configuration(self):
        self.assertEqual(self.post(encoded(), headers={}).status_code, 401)
        with patch.dict(os.environ, {"BACKGROUND_REMOVAL_WORKER_TOKEN": ""}):
            self.assertEqual(self.post(encoded()).status_code, 503)
            self.assertEqual(self.client.get("/health").json()["status"], "unconfigured")

    def test_invalid_oversized_and_pixel_limits(self):
        for data in [b"garbage", b"", b"x" * (main.MAX_BYTES + 1)]:
            self.assertEqual(self.post(data).status_code, 400)
        with patch.object(main, "MAX_PIXELS", 100):
            self.assertEqual(self.post(encoded()).status_code, 400)
        response = self.client.post("/remove-background", content=iter([b"x" * 1_000_000] * 6), headers={**self.headers, "Content-Type": "multipart/form-data; boundary=limit"})
        self.assertEqual(response.status_code, 413)

    def test_busy_worker_and_private_error(self):
        main.inference_lock.acquire()
        try:
            busy = self.post(encoded())
            self.assertEqual(busy.status_code, 503)
            self.assertEqual(busy.headers.get("retry-after"), "2")
            self.assertEqual(self.client.get("/health").status_code, 200)
        finally:
            main.inference_lock.release()
        with patch.object(main, "remove_background", side_effect=RuntimeError("secret/private/path")):
            response = self.post(encoded())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("secret", response.text)
        self.assertFalse(main.inference_lock.locked())

    def test_short_contention_waits_then_processes_without_overlapping_inference(self):
        main.inference_lock.acquire()
        timer = threading.Timer(0.05, main.inference_lock.release)
        timer.start()
        try:
            with patch.object(main, "remove_background", return_value=encoded(transparent=15)):
                self.assertEqual(self.post(encoded(mode="RGB", format="JPEG")).status_code, 200)
        finally:
            timer.join()
        self.assertFalse(main.inference_lock.locked())

    def test_animation_is_rejected(self):
        frames = [Image.new("RGB", (4, 4), color) for color in ["white", "black"]]
        buf = io.BytesIO()
        frames[0].save(buf, format="WEBP", save_all=True, append_images=frames[1:], duration=100, loop=0)
        self.assertEqual(self.post(buf.getvalue()).status_code, 400)

    def test_exif_orientation_normalized(self):
        image = Image.new("RGB", (10, 20), "white")
        exif = Image.Exif()
        exif[274] = 6
        buf = io.BytesIO()
        image.save(buf, format="JPEG", exif=exif)
        self.assertEqual(main.decode_image(buf.getvalue()).size, (20, 10))


if __name__ == "__main__":
    unittest.main()
