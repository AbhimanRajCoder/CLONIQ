"""
utils.py
────────
Shared types and lightweight helpers used across the pipeline.
Keeps every other module free from redundant type definitions.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set


# ── Subtree information attached to every meaningful AST node ─
@dataclass(frozen=True)
class SubtreeInfo:
    """A single subtree fingerprint together with its source location."""
    hash: str
    start_line: int
    end_line: int


# ── Per-file analysis result ─────────────────────────────────
@dataclass
class FileAnalysis:
    """Everything we know about one parsed file."""
    filename: str
    # Original source lines (1-indexed: source_lines[0] = line 1)
    source_lines: List[str] = field(default_factory=list)
    subtree_infos: List[SubtreeInfo] = field(default_factory=list)
    hash_set: Set[str] = field(default_factory=set)
    # Maps hash → list of line ranges (a hash can appear more than once)
    hash_to_lines: Dict[str, List[List[int]]] = field(default_factory=dict)
    # Structural metrics (ast_depth, function_count, etc.)
    metrics: Dict[str, int] = field(default_factory=dict)
    # Normalised AST – stored so advanced similarity layers (CFG/DataFlow)
    # can be run from any endpoint without re-parsing.
    normalised_tree: Optional[Any] = field(default=None)
