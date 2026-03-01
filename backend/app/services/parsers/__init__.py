"""
parsers/__init__.py
───────────────────
Unified parsing entry point.  Routes a source file to the correct
language-specific parser and returns a language-agnostic Unified IR dict.
"""

from typing import Any, Dict

from app.services.language_detector import detect_language


def parse_source(source: str, filename: str) -> Dict[str, Any]:
    """Parse source code into a Unified AST IR dict.

    The returned dict follows the Unified IR schema:
        {
            "type": "<NodeType>",
            "children": [<child_ir>, ...],
            "start_line": int,
            "end_line": int,
        }

    For Python files, the existing `ast` module is used.
    For JS/TS files, Tree-sitter is used.

    Raises SyntaxError or ValueError on failure.
    """
    lang = detect_language(filename)

    if lang == "python":
        from app.services.parsers.python_parser import parse_python
        return parse_python(source, filename)
    elif lang in ("javascript", "typescript"):
        from app.services.parsers.js_parser import parse_js_ts
        return parse_js_ts(source, filename, lang)
    else:
        raise ValueError(f"No parser available for language: {lang}")
