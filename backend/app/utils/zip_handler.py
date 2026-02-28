"""
zip_handler.py
──────────────
Safely extract Python files from an uploaded ZIP archive
entirely in memory – no temporary files touch the disk.
"""

import zipfile
import io
from typing import Dict


def extract_py_files(zip_bytes: bytes) -> Dict[str, str]:
    """
    Read a ZIP archive from raw bytes and return a mapping of
    filename → source code for every `.py` file found inside.

    Parameters
    ----------
    zip_bytes : bytes
        The raw bytes of the uploaded ZIP file.

    Returns
    -------
    Dict[str, str]
        Mapping of relative file path → decoded Python source code.

    Raises
    ------
    zipfile.BadZipFile
        If the uploaded file is not a valid ZIP archive.
    """
    py_files: Dict[str, str] = {}

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        for entry in zf.infolist():
            # Skip directories and non-Python files
            if entry.is_dir():
                continue
            if not entry.filename.endswith(".py"):
                continue
            # Skip hidden / macOS resource-fork files
            if entry.filename.startswith("__MACOSX") or "/." in entry.filename:
                continue

            raw = zf.read(entry.filename)
            try:
                source = raw.decode("utf-8")
            except UnicodeDecodeError:
                continue  # silently skip non-UTF-8 files

            # Use just the filename (not the full nested path) for cleaner output
            # but keep uniqueness by using the full path if there are collisions
            short_name = entry.filename.split("/")[-1]
            if short_name in py_files:
                short_name = entry.filename  # fallback to full path
            py_files[short_name] = source

    return py_files
