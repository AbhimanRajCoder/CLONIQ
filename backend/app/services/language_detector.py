"""
language_detector.py
────────────────────
Detects the programming language / framework from a filename
and optional project-level directory scan.

Public API
----------
detect_language(filename)          → str  ("python" | "javascript" | "typescript")
SUPPORTED_EXTENSIONS               → frozenset of file extensions
detect_framework(file_paths)       → Optional[str]  ("nextjs" | "react" | None)
"""

import os
from typing import Iterable, Optional

# ── Extension → language mapping ─────────────────────────────
_EXT_MAP = {
    ".py":  "python",
    ".js":  "javascript",
    ".jsx": "javascript",
    ".ts":  "typescript",
    ".tsx": "typescript",
}

SUPPORTED_EXTENSIONS = frozenset(_EXT_MAP.keys())


def detect_language(filename: str) -> str:
    """Return the language string for a given filename.

    Raises ValueError if the extension is not supported.
    """
    _, ext = os.path.splitext(filename.lower())
    lang = _EXT_MAP.get(ext)
    if lang is None:
        raise ValueError(
            f"Unsupported file extension '{ext}' for '{filename}'. "
            f"Supported: {sorted(SUPPORTED_EXTENSIONS)}"
        )
    return lang


def is_supported(filename: str) -> bool:
    """Return True if the file has a supported code extension."""
    _, ext = os.path.splitext(filename.lower())
    return ext in _EXT_MAP


def detect_framework(file_paths: Iterable[str]) -> Optional[str]:
    """Inspect a collection of file paths for Next.js / React signals.

    Detection heuristics (evaluated in order):
    1. Next.js  – presence of `app/layout.tsx`, `pages/`, `next.config.*`,
                  or `app/route.ts`.
    2. React    – presence of `.jsx` / `.tsx` files and
                  `package.json` containing "react".

    Returns "nextjs", "react", or None.
    """
    paths = set(file_paths)
    basenames = {os.path.basename(p) for p in paths}

    # Next.js signals
    nextjs_markers = {"layout.tsx", "layout.jsx", "route.ts", "route.tsx"}
    has_next_config = any(
        p.startswith("next.config") for p in basenames
    )
    has_app_dir = any(
        "/app/" in p or p.startswith("app/") for p in paths
    )
    has_pages_dir = any(
        "/pages/" in p or p.startswith("pages/") for p in paths
    )
    has_next_markers = bool(nextjs_markers & basenames)

    if has_next_config or (has_app_dir and has_next_markers) or has_pages_dir:
        return "nextjs"

    # React signals – any JSX / TSX files
    has_jsx = any(p.endswith((".jsx", ".tsx")) for p in paths)
    if has_jsx:
        return "react"

    return None
