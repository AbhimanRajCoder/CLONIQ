"""
parsers/python_parser.py
────────────────────────
Wraps the existing `ast` module to produce a Unified IR dict
that is compatible with the language-agnostic pipeline.
"""

import ast
from typing import Any, Dict, List


def _ast_to_ir(node: ast.AST) -> Dict[str, Any]:
    """Recursively convert a Python AST node to a Unified IR dict."""
    node_type = type(node).__name__

    children: List[Dict[str, Any]] = []
    for child in ast.iter_child_nodes(node):
        children.append(_ast_to_ir(child))

    ir: Dict[str, Any] = {
        "type": node_type,
        "children": children,
        "start_line": getattr(node, "lineno", 0),
        "end_line": getattr(node, "end_lineno", getattr(node, "lineno", 0)),
    }

    # Preserve identifiers for normalisation step
    if isinstance(node, ast.Name):
        ir["name"] = node.id
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        ir["name"] = node.name
        ir["args"] = [arg.arg for arg in node.args.args]
    elif isinstance(node, ast.ClassDef):
        ir["name"] = node.name
    elif isinstance(node, ast.Constant):
        ir["value"] = repr(node.value)
    elif isinstance(node, ast.Import):
        ir["names"] = [alias.name for alias in node.names]
    elif isinstance(node, ast.ImportFrom):
        ir["module"] = node.module
        ir["names"] = [alias.name for alias in node.names]

    return ir


def parse_python(source: str, filename: str = "<uploaded>") -> Dict[str, Any]:
    """Parse Python source into a Unified IR dict.

    Also stores the raw ast.AST as `_raw_ast` on the returned dict
    for backward-compatible advanced similarity layers.
    """
    tree = ast.parse(source, filename=filename)
    ir = _ast_to_ir(tree)
    ir["_raw_ast"] = tree  # keep for legacy pipeline
    ir["language"] = "python"
    return ir
