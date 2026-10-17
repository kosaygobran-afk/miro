"""Restore scikit-image's runtime stubs when a deployment strips type files."""
from pathlib import Path


def install_runtime_stubs():
    bundled = Path(__file__).resolve().parent / "runtime_stubs"
    if not bundled.is_dir():
        return
    import lazy_loader

    original = lazy_loader.attach_stub

    def attach_stub(package_name, filename):
        # Only redirect missing scikit-image stubs, retaining installed behavior
        # everywhere else. These files are copied from the installed dependency.
        source = Path(filename)
        stub = source if str(source).endswith("i") else source.with_suffix(".pyi")
        if (package_name == "skimage" or package_name.startswith("skimage.")) and not stub.is_file():
            replacement = bundled.joinpath(*package_name.split("."), "__init__.stubi")
            if replacement.is_file():
                return original(package_name, str(replacement))
        return original(package_name, filename)

    lazy_loader.attach_stub = attach_stub
