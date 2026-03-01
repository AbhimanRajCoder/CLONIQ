"""
zip_handler.py
──────────────
Safely extract code files from an uploaded ZIP archive
entirely in memory – no temporary files touch the disk.

Supports: .py, .js, .jsx, .ts, .tsx
"""

import zipfile
import io
from typing import Dict, Optional, Set

from app.services.language_detector import SUPPORTED_EXTENSIONS


def extract_py_files(zip_bytes: bytes) -> Dict[str, str]:
    """Legacy alias – extracts all supported code files (not just .py)."""
    return extract_code_files(zip_bytes)


def extract_code_files(
    zip_bytes: bytes,
    extensions: Optional[Set[str]] = None,
) -> Dict[str, str]:
    """
    Read a ZIP archive from raw bytes and return a mapping of
    filename → source code for every supported code file found inside.

    Parameters
    ----------
    zip_bytes : bytes
        The raw bytes of the uploaded ZIP file.
    extensions : Optional[Set[str]]
        Restrict to these extensions.  Defaults to all SUPPORTED_EXTENSIONS.

    Returns
    -------
    Dict[str, str]
        Mapping of relative file path → decoded source code.

    Raises
    ------
    zipfile.BadZipFile
        If the uploaded file is not a valid ZIP archive.
    """
    allowed = extensions or SUPPORTED_EXTENSIONS
    code_files: Dict[str, str] = {}

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        for entry in zf.infolist():
            if entry.is_dir():
                continue

            # Check extension
            fname = entry.filename
            if not any(fname.endswith(ext) for ext in allowed):
                continue

            # Skip hidden / macOS resource-fork / node_modules
            if (
                fname.startswith("__MACOSX")
                or "/." in fname
                or "node_modules/" in fname
            ):
                continue

            raw = zf.read(fname)
            try:
                source = raw.decode("utf-8")
            except UnicodeDecodeError:
                continue

            short_name = fname.split("/")[-1]
            if short_name in code_files:
                short_name = fname
            code_files[short_name] = source

    return code_files
