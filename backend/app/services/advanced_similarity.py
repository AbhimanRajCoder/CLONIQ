"""
advanced_similarity.py
──────────────────────
Implements three structural fingerprinting layers for research-grade
plagiarism detection:

    1.  AST Similarity   – subtree-hash Jaccard (reuses ast_parser.py)
    2.  CFG Similarity   – Control Flow Graph edge-set Jaccard
    3.  DataFlow Similarity – Data Dependency Graph edge-set Jaccard

BUG FIXES (v2)
--------------
1. AST: total_subtrees fields now report len(hash_set) – the number of
   *unique* subtree hashes – so the display is always consistent with the
   Jaccard formula (intersection / union, both over unique-hash sets).

2. CFG: edges are now built *per-function* with locally-reset discovery IDs.
   A global DFS counter made identical function bodies hash differently when
   functions are reordered across files.  Per-function local IDs make the
   CFG fingerprint order-invariant.

3. DataFlow: edges are now built *per-function* with locally-reset variable
   canonical names.  The globally-shared normaliser counter (var_1, var_2, …)
   assigned different canonical names to the same variable depending on
   function definition order.  Resetting the counter per function removes
   that dependency.

Public API
----------
compute_ast_similarity(analysis_a, analysis_b)                 → ASTResult
compute_cfg_similarity(tree_a, tree_b)                         → CFGResult
compute_dataflow_similarity(tree_a, tree_b)                    → DataFlowResult
compute_advanced_similarity(analysis_a, analysis_b, tree_a, tree_b) → AdvancedResult
"""

import ast
import hashlib
import os
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Dict, FrozenSet, List, Set, Tuple

from app.utils.types import FileAnalysis


# ══════════════════════════════════════════════════════════════════════
#  Configurable weights (override via environment variables)
# ══════════════════════════════════════════════════════════════════════

def _weight(env_key: str, default: float) -> float:
    """Read a float weight from an env-var, falling back to *default*."""
    try:
        return float(os.environ.get(env_key, default))
    except (TypeError, ValueError):
        return default


# ══════════════════════════════════════════════════════════════════════
#  Result dataclasses
# ══════════════════════════════════════════════════════════════════════

@dataclass
class ASTResult:
    similarity: float
    total_subtrees_file1: int  # unique hashes in file 1 (= |set_a|)
    total_subtrees_file2: int  # unique hashes in file 2 (= |set_b|)
    shared_subtrees: int       # |intersection|  →  similarity = shared / |union|


@dataclass
class CFGResult:
    similarity: float
    nodes_file1: int   # total CFG nodes across all functions
    nodes_file2: int
    shared_edges: int  # |intersection of hashed edge sets|


@dataclass
class DataFlowResult:
    similarity: float
    edges_file1: int   # raw edge count in file 1
    edges_file2: int
    shared_edges: int  # |intersection of hashed edge sets|


@dataclass
class AdvancedResult:
    ast: ASTResult
    cfg: CFGResult
    dataflow: DataFlowResult
    final_similarity_score: float
    weights: Dict[str, float]


# ══════════════════════════════════════════════════════════════════════
#  1.  AST Similarity
#  FIX: report len(hash_set) – not len(subtree_infos) – for total counts
#  so that total_subtrees, shared_subtrees, and similarity are consistent.
# ══════════════════════════════════════════════════════════════════════

def compute_ast_similarity(
    analysis_a: FileAnalysis,
    analysis_b: FileAnalysis,
) -> ASTResult:
    """
    Jaccard similarity over unique SHA-256 subtree-hash sets.

    Formula:   J = |A ∩ B| / |A ∪ B|

    Fields in the returned ASTResult satisfy:
        total_subtrees_file1 = |set_a|
        total_subtrees_file2 = |set_b|
        shared_subtrees      = |intersection|
        similarity           = shared / |union|

    All counts are consistent with the formula.
    """
    set_a: Set[str] = analysis_a.hash_set  # unique hashes
    set_b: Set[str] = analysis_b.hash_set

    intersection = set_a & set_b
    union = set_a | set_b

    similarity = len(intersection) / len(union) if union else 0.0

    return ASTResult(
        similarity=round(similarity, 6),
        # ── FIX: use unique hash counts, not raw subtree_infos length ──
        total_subtrees_file1=len(set_a),
        total_subtrees_file2=len(set_b),
        shared_subtrees=len(intersection),
    )


# ══════════════════════════════════════════════════════════════════════
#  2.  Control Flow Graph (CFG) Similarity
#  FIX: build per-function with locally-reset discovery IDs so that
#  function reordering does not alter the CFG fingerprint.
# ══════════════════════════════════════════════════════════════════════

# Node types that start a new basic-block scope inside a function
_CFG_SCOPE_NODES = frozenset({
    "If", "For", "While", "AsyncFor",
    "Try", "ExceptHandler",
    "With", "AsyncWith",
    "Match",   # Python 3.10+
})


def _cfg_edges_for_function(func_node: ast.AST) -> Tuple[int, FrozenSet[Tuple[int, int]]]:
    """
    Build a local CFG for a single function (or async function).

    Discovery IDs are reset to 0 at the function boundary so that the
    same internal control-flow structure always produces the same edge set
    regardless of how many functions precede it in the file.

    Returns (local_node_count, frozenset_of_(src, dst)_edges).
    """
    counter: List[int] = [0]
    edges: Set[Tuple[int, int]] = set()

    def _visit(node: ast.AST, parent_id: int) -> None:
        node_type = type(node).__name__

        if node_type in _CFG_SCOPE_NODES:
            my_id = counter[0]
            counter[0] += 1
            edges.add((parent_id, my_id))
            current = my_id
        else:
            current = parent_id

        for child in ast.iter_child_nodes(node):
            _visit(child, current)

    # Entry block = 0; start visiting the function body
    for child in ast.iter_child_nodes(func_node):
        _visit(child, 0)

    node_count = counter[0] + 1  # +1 for the implicit entry block
    return node_count, frozenset(edges)


def _build_cfg_hashes(tree: ast.AST) -> Tuple[int, Set[str]]:
    """
    Walk the top-level AST, extract per-function CFG edges, and hash them.

    Each function's local edges are hashed using only LOCALLY-scoped IDs
    (reset per function), so function reordering does not change the hash set.

    The module body (non-function statements) is treated as a single
    implicit block with its own local sequence of scope-boundary nodes.

    Returns (total_node_count, set_of_sha256_edge_hashes).
    """
    all_hashes: Set[str] = set()
    total_nodes: int = 0

    # ── Per-function scope hashing ───────────────────────────
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            n_nodes, local_edges = _cfg_edges_for_function(node)
            total_nodes += n_nodes
            for src, dst in local_edges:
                token = f"CFG_EDGE:{src}->{dst}"
                all_hashes.add(hashlib.sha256(token.encode()).hexdigest())

    # ── Module-level (top-level scope, excluding function bodies) ──
    module_counter: List[int] = [0]
    module_edges: Set[Tuple[int, int]] = set()

    def _visit_module(node: ast.AST, parent_id: int, depth: int) -> None:
        """Visit only module-level statements (don't recurse into functions)."""
        node_type = type(node).__name__

        # Stop at function boundaries (handled per-function above)
        if depth > 0 and node_type in ("FunctionDef", "AsyncFunctionDef"):
            return

        if node_type in _CFG_SCOPE_NODES:
            my_id = module_counter[0]
            module_counter[0] += 1
            module_edges.add((parent_id, my_id))
            current = my_id
        else:
            current = parent_id

        for child in ast.iter_child_nodes(node):
            _visit_module(child, current, depth + 1)

    _visit_module(tree, 0, 0)
    total_nodes += module_counter[0] + 1  # +1 for module root

    for src, dst in module_edges:
        token = f"CFG_MODULE_EDGE:{src}->{dst}"
        all_hashes.add(hashlib.sha256(token.encode()).hexdigest())

    return total_nodes, all_hashes


def compute_cfg_similarity(tree_a: ast.AST, tree_b: ast.AST) -> CFGResult:
    """
    Build per-function CFGs for each normalised AST and compute Jaccard
    similarity over the combined hashed edge sets.

    Edge-case: when BOTH files contain only linear (branch-free) functions,
    both edge sets are empty.  Empty ∩ Empty = Empty but the two graphs ARE
    structurally identical → similarity = 1.0.
    If only ONE file is empty the graphs differ → similarity = 0.0.
    """
    nodes_a, hashed_a = _build_cfg_hashes(tree_a)
    nodes_b, hashed_b = _build_cfg_hashes(tree_b)

    intersection = hashed_a & hashed_b
    union = hashed_a | hashed_b

    # ── Symmetric empty-set guard ─────────────────────────────────────
    if not hashed_a and not hashed_b:
        # Both files are purely linear (no branching / looping).
        # Their CFG structures are identical → full similarity.
        similarity = 1.0
    elif not union:
        similarity = 0.0
    else:
        similarity = len(intersection) / len(union)

    return CFGResult(
        similarity=round(similarity, 6),
        nodes_file1=nodes_a,
        nodes_file2=nodes_b,
        shared_edges=len(intersection),
    )


# ══════════════════════════════════════════════════════════════════════
#  3.  Data Flow / Dependency Graph (DFG) Similarity
#  FIX: process each function independently with locally-reset variable
#  canonical names so that global normaliser ordering doesn't pollute
#  intra-function edge fingerprints.
# ══════════════════════════════════════════════════════════════════════

def _local_canonical_renamer(func_node: ast.AST) -> ast.AST:
    """
    Return a deep-copied FunctionDef with variables renamed using a
    *fresh* local counter starting at 1.

    This is intentionally a lightweight re-normalisation scoped only to
    the function body.  It mirrors the logic in normalizer._NameCanonicalizer
    but operates on an already-parsed (and globally-normalised) subtree —
    we just reset the numbering so that the first variable seen inside
    this function is always ``var_1``.
    """
    copy = deepcopy(func_node)
    var_map: Dict[str, str] = {}
    counter: List[int] = [0]

    def _canonical(original: str) -> str:
        if original not in var_map:
            counter[0] += 1
            var_map[original] = f"lv_{counter[0]}"
        return var_map[original]

    class _LocalRenamer(ast.NodeTransformer):
        def visit_Name(self, node: ast.Name) -> ast.Name:
            node.id = _canonical(node.id)
            return node

        def visit_arg(self, node: ast.arg) -> ast.arg:
            node.arg = _canonical(node.arg)
            return node

    return _LocalRenamer().visit(copy)


def _dataflow_edges_for_scope(scope_node: ast.AST) -> Set[Tuple[str, str]]:
    """
    Extract data-dependency edges from a single scope (function body or
    module-level block).

    Model
    -----
    • A *definition* occurs at any assignment target.
    • A *use* occurs at any Name(Load) on the right-hand side.
    • An edge (producer, consumer) is emitted when a definition's RHS
      contains a use of a previously-defined variable.
    • __return__ is a synthetic sink for Return statements.

    Variable names in *scope_node* must already be locally canonicalised
    (by ``_local_canonical_renamer``) before calling this function so that
    the same intra-function structure always yields the same edge set.
    """
    edges: Set[Tuple[str, str]] = set()
    defined: Set[str] = set()

    def _used_names(node: ast.AST) -> Set[str]:
        return {
            n.id
            for n in ast.walk(node)
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)
        }

    def _targets(nodes: List[ast.expr]) -> List[str]:
        names: List[str] = []
        for t in nodes:
            if isinstance(t, ast.Name):
                names.append(t.id)
            elif isinstance(t, (ast.Tuple, ast.List)):
                names.extend(e.id for e in t.elts if isinstance(e, ast.Name))
        return names

    class _DFG(ast.NodeVisitor):
        def visit_Assign(self, node: ast.Assign) -> None:
            defs = _targets(node.targets)
            used = _used_names(node.value)
            for d in defs:
                defined.add(d)
                for u in used:
                    if u != d:
                        edges.add((u, d))
            self.generic_visit(node)

        def visit_AugAssign(self, node: ast.AugAssign) -> None:
            if isinstance(node.target, ast.Name):
                d = node.target.id
                defined.add(d)
                for u in _used_names(node.value):
                    if u != d:
                        edges.add((u, d))
            self.generic_visit(node)

        def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
            if node.value and isinstance(node.target, ast.Name):
                d = node.target.id
                defined.add(d)
                for u in _used_names(node.value):
                    if u != d:
                        edges.add((u, d))
            self.generic_visit(node)

        def visit_For(self, node: ast.For) -> None:
            if isinstance(node.target, ast.Name):
                d = node.target.id
                defined.add(d)
                for u in _used_names(node.iter):
                    edges.add((u, d))
            self.generic_visit(node)

        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            # Args count as definitions inside the function scope
            for arg in node.args.args:
                defined.add(arg.arg)
            self.generic_visit(node)

        visit_AsyncFunctionDef = visit_FunctionDef

        def visit_Return(self, node: ast.Return) -> None:
            if node.value:
                for u in _used_names(node.value):
                    if u in defined:
                        edges.add((u, "__return__"))
            self.generic_visit(node)

    _DFG().visit(scope_node)
    return edges


def _build_dataflow_hashes(tree: ast.AST) -> Tuple[Set[str], int]:
    """
    Extract data-dependency edges per function (with locally-reset variable
    names) and hash each edge into a canonical token.

    Returns (set_of_sha256_hashes, total_raw_edge_count).

    The *hashed set* is what Jaccard operates over.  Raw edge count is
    kept separately for debug / informational purposes only.
    """
    all_hashes: Set[str] = set()
    total_raw_edges: int = 0

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            local_node = _local_canonical_renamer(node)
            edges = _dataflow_edges_for_scope(local_node)
            total_raw_edges += len(edges)
            for src, dst in edges:
                token = f"DFG_EDGE:{src}->{dst}"
                all_hashes.add(hashlib.sha256(token.encode()).hexdigest())

    return all_hashes, total_raw_edges


def compute_dataflow_similarity(tree_a: ast.AST, tree_b: ast.AST) -> DataFlowResult:
    """
    Build per-function Data Dependency Graphs (with locally-reset variable
    canonical names) and compute Jaccard similarity over hashed edge sets.

    All reported counts (edges_file1, edges_file2, shared_edges) refer to
    the *hashed structural pattern set* so the invariant always holds:

        similarity ≈ shared_edges / (edges_file1 + edges_file2 - shared_edges)

    Edge-case: when both files have zero data-flow edges (e.g. trivial
    pass-through functions), both sets are empty → similarity = 1.0.
    """
    hashed_a, _ = _build_dataflow_hashes(tree_a)
    hashed_b, _ = _build_dataflow_hashes(tree_b)

    intersection = hashed_a & hashed_b
    union = hashed_a | hashed_b

    # ── Symmetric empty-set guard ─────────────────────────────────────
    if not hashed_a and not hashed_b:
        similarity = 1.0
    elif not union:
        similarity = 0.0
    else:
        similarity = len(intersection) / len(union)

    return DataFlowResult(
        similarity=round(similarity, 6),
        # ── FIX: report unique hashed counts so numbers match Jaccard ──
        edges_file1=len(hashed_a),
        edges_file2=len(hashed_b),
        shared_edges=len(intersection),
    )


# ══════════════════════════════════════════════════════════════════════
#  4.  Combined advanced analysis
# ══════════════════════════════════════════════════════════════════════

def compute_advanced_similarity(
    analysis_a: FileAnalysis,
    analysis_b: FileAnalysis,
    normalised_tree_a: ast.AST,
    normalised_tree_b: ast.AST,
) -> AdvancedResult:
    """
    Run all three similarity layers and aggregate into a weighted score.

    Weights are re-read from env-vars on every call so that tests can
    patch ``os.environ`` without module reload.
    """
    w_ast      = _weight("AST_WEIGHT",      0.4)
    w_cfg      = _weight("CFG_WEIGHT",      0.3)
    w_dataflow = _weight("DATAFLOW_WEIGHT", 0.3)

    ast_result = compute_ast_similarity(analysis_a, analysis_b)
    cfg_result = compute_cfg_similarity(normalised_tree_a, normalised_tree_b)
    df_result  = compute_dataflow_similarity(normalised_tree_a, normalised_tree_b)

    final = (
        w_ast      * ast_result.similarity
        + w_cfg    * cfg_result.similarity
        + w_dataflow * df_result.similarity
    )

    return AdvancedResult(
        ast=ast_result,
        cfg=cfg_result,
        dataflow=df_result,
        final_similarity_score=round(final, 6),
        weights={
            "ast":      round(w_ast, 4),
            "cfg":      round(w_cfg, 4),
            "dataflow": round(w_dataflow, 4),
        },
    )


# ══════════════════════════════════════════════════════════════════════
#  5.  Flag / confidence helpers
# ══════════════════════════════════════════════════════════════════════

_PLAGIARISM_THRESHOLD = 0.75

_CONFIDENCE_BANDS: List[Tuple[float, str]] = [
    (0.85, "VERY HIGH"),
    (0.75, "HIGH"),
    (0.60, "MODERATE"),
    (0.0,  "LOW"),
]


def plagiarism_flag(score: float) -> bool:
    """Return True if *score* meets or exceeds the plagiarism threshold (0.75)."""
    return score >= _PLAGIARISM_THRESHOLD


def confidence_level(score: float) -> str:
    """Map a [0, 1] similarity score to a descriptive confidence label."""
    for threshold, label in _CONFIDENCE_BANDS:
        if score >= threshold:
            return label
    return "LOW"


# ══════════════════════════════════════════════════════════════════════
#  6.  Response serialisation helper
# ══════════════════════════════════════════════════════════════════════

def build_advanced_response(
    file1_name: str,
    file2_name: str,
    result: AdvancedResult,
    normalization_applied: bool = True,
    dead_code_removed: bool = True,
) -> Dict[str, Any]:
    """
    Serialise an AdvancedResult into the canonical JSON response shape.

    Relationship between reported numbers and the similarity formula:

        AST:
            similarity = shared_subtrees / (total_file1 + total_file2 - shared)
            (Jaccard over unique-hash sets)

        CFG / DataFlow:
            similarity = shared_edges / |union of hashed edge sets|
    """
    score = result.final_similarity_score

    return {
        "file1": file1_name,
        "file2": file2_name,
        "ast": {
            "similarity": result.ast.similarity,
            "total_subtrees_file1": result.ast.total_subtrees_file1,
            "total_subtrees_file2": result.ast.total_subtrees_file2,
            "shared_subtrees": result.ast.shared_subtrees,
        },
        "cfg": {
            "similarity": result.cfg.similarity,
            "nodes_file1": result.cfg.nodes_file1,
            "nodes_file2": result.cfg.nodes_file2,
            "shared_edges": result.cfg.shared_edges,
        },
        "dataflow": {
            "similarity": result.dataflow.similarity,
            "edges_file1": result.dataflow.edges_file1,
            "edges_file2": result.dataflow.edges_file2,
            "shared_edges": result.dataflow.shared_edges,
        },
        "final_similarity_score": score,
        "plagiarism_flag": plagiarism_flag(score),
        "confidence_level": confidence_level(score),
        "analysis_metadata": {
            "normalization_applied": normalization_applied,
            "dead_code_removed": dead_code_removed,
            "weights": result.weights,
        },
    }
