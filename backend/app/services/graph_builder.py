"""
graph_builder.py
────────────────
Transforms pairwise similarity results into graph, matrix, and cluster
structures.  All functions are pure — deterministic for the same input.

ACCURACY RULES
--------------
• Graph node count MUST equal total file count (not just files with edges).
• Graph edges correspond to pairs with similarity_score >= threshold.
• Edge weight exactly equals similarity_score (no transformation).
• Matrix is symmetric with diagonal = 1.0 and off-diagonal from pairs.
• Clusters: connected components of the subgraph where score >= threshold.

Public API
----------
build_similarity_graph(results, all_files, threshold) → dict
build_similarity_matrix(results, filenames)            → dict
detect_clusters(results, threshold)                    → dict
"""

from collections import defaultdict, deque
from typing import Any, Dict, List, Set


# ── Similarity graph ─────────────────────────────────────────

def build_similarity_graph(
    results: List[Dict[str, Any]],
    all_files: List[str],
    threshold: float = 0.5,
) -> Dict[str, Any]:
    """
    Convert pairwise similarity results into a node-edge graph.

    **Every file in ``all_files`` becomes a node**, even if it has no
    edges above the threshold.  This guarantees that
    ``len(nodes) == len(all_files)``.

    Only edges with ``similarity_score >= threshold`` are included.
    Edge ``weight`` is the raw ``similarity_score`` — never transformed.

    Returns
    -------
    dict
        ``{"nodes": [{"id": ...}], "edges": [{"source", "target", "weight"}]}``
    """
    # All files → nodes (sorted for determinism)
    nodes = [{"id": f} for f in sorted(all_files)]

    edges: List[Dict[str, Any]] = []
    for pair in results:
        score: float = pair["similarity_score"]
        if score < threshold:
            continue
        edges.append({
            "source": pair["file1"],
            "target": pair["file2"],
            "weight": round(score, 4),
        })

    # Sort edges for determinism (source asc, target asc)
    edges.sort(key=lambda e: (e["source"], e["target"]))

    return {"nodes": nodes, "edges": edges}


# ── Similarity matrix (heatmap data) ────────────────────────

def build_similarity_matrix(
    results: List[Dict[str, Any]],
    filenames: List[str],
) -> Dict[str, Any]:
    """
    Build a symmetric similarity matrix from pairwise results.

    Parameters
    ----------
    results : list
        Pairwise similarity dicts (must contain file1, file2, similarity_score).
    filenames : list
        Ordered list of all filenames; defines rows/columns.

    Returns
    -------
    dict
        ``{"files": [...], "matrix": [[float, ...], ...]}``

    ACCURACY INVARIANTS
    • matrix[i][i] == 1.0  (self-similarity)
    • matrix[i][j] == matrix[j][i]
    • If no pair exists for (i,j), value is 0.0
    • Values are raw similarity_score with no transformation
    """
    n = len(filenames)
    idx = {name: i for i, name in enumerate(filenames)}

    # Identity matrix (self-similarity = 1.0, rest = 0.0)
    matrix: List[List[float]] = [[0.0] * n for _ in range(n)]
    for i in range(n):
        matrix[i][i] = 1.0

    for pair in results:
        f1: str = pair["file1"]
        f2: str = pair["file2"]
        score: float = pair["similarity_score"]
        if f1 in idx and f2 in idx:
            i, j = idx[f1], idx[f2]
            matrix[i][j] = round(score, 4)
            matrix[j][i] = round(score, 4)

    return {"files": filenames, "matrix": matrix}


# ── Suspicious cluster detection ────────────────────────────

def detect_clusters(
    results: List[Dict[str, Any]],
    threshold: float = 0.75,
) -> Dict[str, Any]:
    """
    Build a graph of files connected by high similarity and
    find connected components via BFS.

    Only includes clusters with 2+ members (singletons are excluded).

    Returns
    -------
    dict
        ``{"clusters": [{"members": [...], "average_similarity": float}]}``
    """
    # ── Build adjacency list ─────────────────────────────────
    adj: Dict[str, Set[str]] = defaultdict(set)
    edge_scores: Dict[tuple, float] = {}

    for pair in results:
        score: float = pair["similarity_score"]
        if score < threshold:
            continue
        f1: str = pair["file1"]
        f2: str = pair["file2"]
        adj[f1].add(f2)
        adj[f2].add(f1)
        key = (min(f1, f2), max(f1, f2))  # canonical key
        edge_scores[key] = score

    # ── BFS to find connected components ─────────────────────
    visited: Set[str] = set()
    clusters: List[Dict[str, Any]] = []

    for start in sorted(adj.keys()):
        if start in visited:
            continue

        component: List[str] = []
        queue: deque = deque([start])
        visited.add(start)

        while queue:
            node = queue.popleft()
            component.append(node)
            for neighbour in sorted(adj[node]):
                if neighbour not in visited:
                    visited.add(neighbour)
                    queue.append(neighbour)

        # Skip singleton "clusters"
        if len(component) < 2:
            continue

        # ── Average similarity within this cluster ───────────
        cluster_scores: List[float] = []
        for i, a in enumerate(component):
            for b in component[i + 1:]:
                key = (min(a, b), max(a, b))
                if key in edge_scores:
                    cluster_scores.append(edge_scores[key])

        avg = round(
            sum(cluster_scores) / len(cluster_scores), 4
        ) if cluster_scores else 0.0

        clusters.append({
            "members": sorted(component),
            "average_similarity": avg,
        })

    return {"clusters": clusters}
