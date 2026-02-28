"""
ast_parser.py
─────────────
Handles two responsibilities:

1. **Parsing** – convert raw Python source code into an `ast.AST`.
2. **Subtree hashing with line tracking** – walk a (normalised) AST
   and produce SubtreeInfo records that pair each subtree's SHA-256
   fingerprint with its start/end line numbers.
"""

import ast
import hashlib
from typing import Dict, List, Set

from app.utils.types import FileAnalysis, SubtreeInfo

# ── Node types too small to be meaningful structural units ────
# We still hash them (they contribute to parent hashes) but we
# don't track them as standalone "regions" for line reporting.
_TRIVIAL_NODES = frozenset({
    "Name", "Constant", "Load", "Store", "Del",
    "Add", "Sub", "Mult", "Div", "Mod", "Pow",
    "LShift", "RShift", "BitOr", "BitXor", "BitAnd",
    "FloorDiv", "And", "Or", "Not", "Invert",
    "UAdd", "USub", "Eq", "NotEq", "Lt", "LtE",
    "Gt", "GtE", "Is", "IsNot", "In", "NotIn",
    "alias", "arg",
})


def parse_code(source: str, filename: str = "<uploaded>") -> ast.AST:
    """
    Parse a Python source string into an AST.

    Raises SyntaxError if the source is invalid Python.
    """
    return ast.parse(source, filename=filename)


def generate_subtree_hashes(tree: ast.AST) -> FileAnalysis:
    """
    Walk the entire normalised AST and collect a SubtreeInfo for
    every *meaningful* node (i.e. not trivially small like a bare
    Name or operator).

    Returns a FileAnalysis dataclass populated with:
      - subtree_infos  : list of SubtreeInfo (hash + lines)
      - hash_set       : set of unique hashes (for Jaccard)
      - hash_to_lines  : hash → list of [start, end] ranges

    The hash for each node is defined recursively as:
        SHA-256( NodeType | sorted(child_hashes) )
    """
    infos: List[SubtreeInfo] = []
    hash_set: Set[str] = set()
    hash_to_lines: Dict[str, List[List[int]]] = {}

    def _collect(node: ast.AST) -> str:
        """Recursively hash a node and, if meaningful, record its info."""
        # 1. Hash all children first
        child_hashes: List[str] = []
        for child in ast.iter_child_nodes(node):
            child_hashes.append(_collect(child))

        # 2. Build fingerprint:  "NodeType|child1|child2|..."
        node_type = type(node).__name__
        fingerprint = node_type
        if child_hashes:
            fingerprint += "|" + "|".join(sorted(child_hashes))

        h = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()

        # 3. Record only meaningful (non-trivial) nodes
        if node_type not in _TRIVIAL_NODES:
            start = getattr(node, "lineno", 0)
            end = getattr(node, "end_lineno", start)

            info = SubtreeInfo(hash=h, start_line=start, end_line=end)
            infos.append(info)
            hash_set.add(h)

            # Track every occurrence of this hash with its line range
            hash_to_lines.setdefault(h, []).append([start, end])

        return h

    _collect(tree)

    return FileAnalysis(
        filename="",  # caller fills this in
        subtree_infos=infos,
        hash_set=hash_set,
        hash_to_lines=hash_to_lines,
    )
