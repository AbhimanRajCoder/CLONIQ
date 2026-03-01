"""
visualization.py
────────────────
Converts a normalized AST into a lightweight tree-JSON structure
suitable for front-end visualisation (e.g. D3 tree layouts).

Public API
----------
ast_to_tree_json(node) → dict
"""

import ast
from typing import Any, Dict, List


def ast_to_tree_json(node: ast.AST) -> Dict[str, Any]:
    """
    Recursively convert an AST node into a JSON-serialisable tree.

    Each node becomes::

        {
            "name": "<NodeType>",
            "children": [ ... ]     # omitted when empty
        }

    Parameters
    ----------
    node : ast.AST
        The root of the (normalised) AST to convert.

    Returns
    -------
    dict
        A nested dictionary representing the tree.
    """
    node_type: str = type(node).__name__

    children: List[Dict[str, Any]] = [
        ast_to_tree_json(child) for child in ast.iter_child_nodes(node)
    ]

    result: Dict[str, Any] = {"name": node_type}
    if children:
        result["children"] = children

    return result
