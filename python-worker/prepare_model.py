"""Bundle the fixed ISNet weights without importing/compiling inference packages."""
import hashlib
import importlib.util
import shutil
from pathlib import Path
from urllib.request import urlopen

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx"
# The checksum pinned by rembg 2.0.85's DisSession for this exact model.
MODEL_MD5 = "fc16ebd8b0c10d971d3513d564d01e29"
model = Path(__file__).resolve().parent / "models" / "isnet-general-use.onnx"
model.parent.mkdir(exist_ok=True)

def valid_model():
    if not model.is_file():
        return False
    with model.open("rb") as source:
        return hashlib.file_digest(source, "md5").hexdigest() == MODEL_MD5

if not valid_model():
    partial = model.with_suffix(".download")
    try:
        with urlopen(MODEL_URL, timeout=60) as response, partial.open("wb") as output:
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 200 * 1024 * 1024:
                    raise RuntimeError("ISNet download exceeded expected size bound")
                output.write(chunk)
        with partial.open("rb") as source:
            if hashlib.file_digest(source, "md5").hexdigest() != MODEL_MD5:
                raise RuntimeError("ISNet weights checksum mismatch")
        partial.replace(model)
    finally:
        partial.unlink(missing_ok=True)
print("Prepared checksum-verified isnet-general-use weights")

# Vercel removes .pyi files, but scikit-image reads these at runtime via lazy_loader.
# Preserve exact installed contents as data files that the packager retains.
spec = importlib.util.find_spec("skimage")
if spec is None or not spec.submodule_search_locations:
    raise RuntimeError("scikit-image runtime package is missing")
package = Path(next(iter(spec.submodule_search_locations)))
output = Path(__file__).resolve().parent / "runtime_stubs" / "skimage"
count = 0
for stub in package.rglob("__init__.pyi"):
    target = (output / stub.relative_to(package)).with_suffix(".stubi")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(stub, target)
    count += 1
if not count:
    raise RuntimeError("scikit-image runtime stubs are missing")
print(f"Preserved {count} scikit-image runtime stubs")
