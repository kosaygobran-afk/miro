"""Exercise real scikit-image imports through the stripped-stub fallback."""
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import lazy_loader
import numpy as np
import platform_compat


class RuntimeStubTests(unittest.TestCase):
    def test_missing_stub_loads_real_morphology_functions(self):
        package = Path(next(iter(importlib.util.find_spec("skimage").submodule_search_locations)))
        original = lazy_loader.attach_stub
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "runtime_stubs/skimage/__init__.stubi"
            target.parent.mkdir(parents=True)
            shutil.copyfile(package / "__init__.pyi", target)
            try:
                with patch.object(platform_compat, "__file__", str(root / "platform_compat.py")):
                    platform_compat.install_runtime_stubs()
                getter, _, _ = lazy_loader.attach_stub("skimage", "/missing/skimage/__init__.py")
                footprint = getter("morphology").disk(1)
                self.assertEqual(footprint.shape, (3, 3))
                image = np.ones((5, 5), dtype=np.uint8)
                np.testing.assert_array_equal(getter("morphology").opening(image, footprint), image)
                # A different package must still report its genuinely missing stub.
                with self.assertRaises(ValueError):
                    lazy_loader.attach_stub("unrelated", "/missing/unrelated/__init__.py")
            finally:
                lazy_loader.attach_stub = original


if __name__ == "__main__":
    unittest.main()
