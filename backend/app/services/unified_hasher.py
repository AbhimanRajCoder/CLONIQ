"""
unified_hasher.py
─────────────────
Language-agnostic subtree hashing on Unified IR dicts.

Equivalent to `ast_parser.generate_subtree_hashes` but works on the
Unified IR dict format instead of Python `ast.AST` objects.

Public API
----------
hash_ir(ir_tree) → FileAnalysis
"""

import hashlib
from typing import Any, Dict, List, Set

from app.utils.types import FileAnalysis, SubtreeInfo
from app.services.unified_normalizer import TRIVIAL_IR_TYPES


def hash_ir(ir: Dict[str, Any]) -> FileAnalysis:
    """Walk a normalised Unified IR tree and collect SubtreeInfo records.

    Returns a FileAnalysis populated with:
      - subtree_infos : list of SubtreeInfo (hash + lines)
      - hash_set      : set of unique hashes (for Jaccard)
      - hash_to_lines : hash → list of [start, end] ranges

    The hash for each node is:
        SHA-256( NodeType | sorted(child_hashes) )
    """
    infos: List[SubtreeInfo] = []
    hash_set: Set[str] = set()
    hash_to_lines: Dict[str, List[List[int]]] = {}

    def _collect(node: Dict[str, Any]) -> str:
        children = node.get("children", [])

        # Hash children first
        child_hashes: List[str] = []
        for child in children:
            child_hashes.append(_collect(child))

        # Build fingerprint
        node_type = node.get("type", "Unknown")
        fingerprint = node_type
        if child_hashes:
            fingerprint += "|" + "|".join(sorted(child_hashes))

        h = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()

        # Record only meaningful (non-trivial) nodes
        if node_type not in TRIVIAL_IR_TYPES:
            start = node.get("start_line", 0)
            end = node.get("end_line", start)

            info = SubtreeInfo(hash=h, start_line=start, end_line=end)
            infos.append(info)
            hash_set.add(h)
            hash_to_lines.setdefault(h, []).append([start, end])

        return h

    _collect(ir)

    return FileAnalysis(
        filename="",  # caller fills this in
        subtree_infos=infos,
        hash_set=hash_set,
        hash_to_lines=hash_to_lines,
    )
