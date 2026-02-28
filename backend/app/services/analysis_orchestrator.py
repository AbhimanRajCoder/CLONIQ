"""
analysis_orchestrator.py
════════════════════════
Unified analysis orchestration layer.

Accepts pre-processed file analyses and deterministically produces
a single structured response containing similarity pairs, graph,
matrix, clusters, and per-file metrics — all derived from exactly
the same similarity computation, with no global state involved.

When pairs contain Gemini LLM verdicts (for scores ≥ 0.70), the
orchestrator aggregates them into a top-level ``llm_summary`` block.

DETERMINISM GUARANTEES
──────────────────────
• All file lists are sorted.
• Graph nodes = ALL files, not just files with edges.
• Graph edge list is sorted by (source, target).
• Matrix is built from the same pairs list.
• Clusters use the same pairs list with threshold >= 0.75.
• UUID is generated per call; timestamp is UTC ISO.

Public API
----------
run_unified_analysis(analyses, errors, analysis_type, similarity_fn, **kwargs)
    → dict   (the complete unified response payload)
"""

import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from app.services.graph_builder import (
    build_similarity_graph,
    build_similarity_matrix,
    detect_clusters,
)
from app.utils.types import FileAnalysis


def _build_llm_summary(similarity_pairs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Build an aggregate summary of LLM verdicts across all evaluated pairs.

    Returns None if no pairs were evaluated by the LLM.
    """
    evaluated = [p for p in similarity_pairs if "llm_verdict" in p]
    if not evaluated:
        return None

    classifications = Counter(
        p["llm_verdict"]["classification"] for p in evaluated
    )
    risk_levels = Counter(
        p["refined_verdict"]["refined_risk_level"]
        for p in evaluated
        if "refined_verdict" in p
    )

    return {
        "pairs_evaluated_by_llm": len(evaluated),
        "classification_breakdown": dict(classifications),
        "risk_level_breakdown": dict(risk_levels),
        "likely_copy_count": classifications.get("LIKELY_COPY", 0),
        "standard_algorithm_count": classifications.get("STANDARD_ALGORITHM", 0),
        "template_count": classifications.get("TEMPLATE_OR_BOILERPLATE", 0),
    }


def run_unified_analysis(
    analyses: Dict[str, FileAnalysis],
    errors: List[Dict[str, str]],
    analysis_type: str,
    similarity_fn: Callable[..., List[Dict[str, Any]]],
    similarity_kwargs: Optional[Dict[str, Any]] = None,
    extra_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Execute the full analysis pipeline and return a unified response.

    Parameters
    ----------
    analyses : dict
        Mapping of filename → FileAnalysis (already parsed, normalised, hashed).
    errors : list
        Any processing errors accumulated so far.
    analysis_type : str
        A label such as "multi_file", "pair", "zip_cross", "github_cross".
    similarity_fn : callable
        The function to compute pairwise similarities.
        Must return List[Dict] of similarity-pair dicts.
    similarity_kwargs : dict | None
        Extra keyword arguments forwarded to ``similarity_fn``.
    extra_summary : dict | None
        Additional keys merged into the ``summary`` block
        (e.g. repo URLs, ZIP names).

    Returns
    -------
    dict
        The complete unified response payload.
    """
    kwargs = similarity_kwargs or {}
    similarity_pairs: List[Dict[str, Any]] = similarity_fn(**kwargs)

    # ── Deterministic file list ──────────────────────────────
    filenames = sorted(analyses.keys())

    # ── Deterministic visualisation from the SAME pairs ──────
    # ALL files appear as nodes — even those with no edges
    graph = build_similarity_graph(similarity_pairs, all_files=filenames, threshold=0.5)
    matrix = build_similarity_matrix(similarity_pairs, filenames)
    clusters_data = detect_clusters(similarity_pairs, threshold=0.75)

    # ── Per-file metrics ─────────────────────────────────────
    file_metrics: List[Dict[str, Any]] = []
    for fname in filenames:
        fa = analyses[fname]
        file_metrics.append({
            "file": fname,
            "metrics": fa.metrics,
            "total_subtrees": len(fa.subtree_infos),
            "unique_subtrees": len(fa.hash_set),
        })

    # ── Summary stats ────────────────────────────────────────
    highest_score = (
        max(p["similarity_score"] for p in similarity_pairs)
        if similarity_pairs
        else 0.0
    )

    summary: Dict[str, Any] = {
        "total_files": len(analyses),
        "suspicious_pairs_count": len(similarity_pairs),
        "highest_similarity": round(highest_score, 4),
        "cluster_count": len(clusters_data.get("clusters", [])),
    }
    if extra_summary:
        summary.update(extra_summary)

    # ── LLM verdict summary ─────────────────────────────────
    llm_summary = _build_llm_summary(similarity_pairs)

    # ── Assemble final response ──────────────────────────────
    response: Dict[str, Any] = {
        "analysis_id": str(uuid.uuid4()),
        "summary": summary,
        "files": filenames,
        "similarity": {
            "pairs": similarity_pairs,
            "matrix": {
                "files": matrix["files"],
                "values": matrix["matrix"],
            },
            "graph": graph,
            "clusters": clusters_data.get("clusters", []),
        },
        "metrics": file_metrics,
        "metadata": {
            "analysis_type": analysis_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "llm_enabled": llm_summary is not None,
        },
    }

    if llm_summary is not None:
        response["llm_summary"] = llm_summary

    if errors:
        response["errors"] = errors

    return response
