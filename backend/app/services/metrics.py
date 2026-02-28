"""
metrics.py
──────────
Structural complexity metrics derived from a parsed AST.

Public API
----------
compute_ast_metrics(tree) → dict
"""

import ast
from typing import Any, Dict


# Node types that count as decision points for cyclomatic complexity
_DECISION_NODES = frozenset({
    "If", "For", "While", "AsyncFor",
    "And", "Or", "ExceptHandler",
})


def compute_ast_metrics(tree: ast.AST) -> Dict[str, int]:
    """
    Walk the entire AST once and compute structural metrics.

    Returned dictionary keys
    ------------------------
    ast_depth : int
        Maximum nesting depth of the tree.
    function_count : int
        Number of ``FunctionDef`` and ``AsyncFunctionDef`` nodes.
    loop_count : int
        Number of ``For``, ``While``, and ``AsyncFor`` nodes.
    if_count : int
        Number of ``If`` nodes.
    basic_cyclomatic_complexity : int
        1 + number of decision-point nodes (If, For, While,
        AsyncFor, And, Or, ExceptHandler).
    """
    function_count: int = 0
    loop_count: int = 0
    if_count: int = 0
    decision_count: int = 0

    def _max_depth(node: ast.AST) -> int:
        nonlocal function_count, loop_count, if_count, decision_count

        node_type: str = type(node).__name__

        # ── Counters ─────────────────────────────────────────
        if node_type in ("FunctionDef", "AsyncFunctionDef"):
            function_count += 1
        elif node_type in ("For", "While", "AsyncFor"):
            loop_count += 1
        elif node_type == "If":
            if_count += 1

        if node_type in _DECISION_NODES:
            decision_count += 1

        # ── Depth (leaf nodes have depth 1) ──────────────────
        child_depths = [_max_depth(child) for child in ast.iter_child_nodes(node)]
        return 1 + max(child_depths) if child_depths else 1

    ast_depth: int = _max_depth(tree)

    return {
        "ast_depth": ast_depth,
        "function_count": function_count,
        "loop_count": loop_count,
        "if_count": if_count,
        "basic_cyclomatic_complexity": 1 + decision_count,
    }
