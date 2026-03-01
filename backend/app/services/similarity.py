"""
similarity.py
─────────────
Pairwise similarity computation using the three-layer advanced engine
(AST + CFG + DataFlow weighted score) when normalised trees are available,
falling back to plain Jaccard AST similarity otherwise.

When the structural similarity score for a pair is ≥ 0.70, the Gemini
AI Semantic Judge is invoked to refine the verdict (standard algorithm,
boilerplate, or likely copy).

The ``similarity_score`` field in every returned pair now reflects the same
``final_similarity_score`` that ``/analyze-advanced`` reports, ensuring all
endpoints are consistent.
"""

import ast as _ast
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.services.advanced_similarity import compute_advanced_similarity
from app.services.llm_judge import (
    LLMVerdict,
    SimilarityScores,
    compute_refined_verdict,
    evaluate_pair,
    should_invoke_llm,
    verdict_to_dict,
)
from app.utils.types import FileAnalysis

logger = logging.getLogger(__name__)


def _extract_code_snippet(source_lines: List[str], start: int, end: int) -> List[Dict[str, Any]]:
    """
    Extract source code lines between `start` and `end` (1-indexed, inclusive).
    Returns a list of {line_number, code} dicts.

    Handles edge cases where AST line numbers might be 0 or exceed file length.
    """
    # Clamp to valid range (source_lines is 0-indexed, line numbers are 1-indexed)
    start = max(1, start)
    end = min(len(source_lines), end)

    snippet: List[Dict[str, Any]] = []
    for lineno in range(start, end + 1):
        snippet.append({
            "line_number": lineno,
            "code": source_lines[lineno - 1],  # convert 1-indexed → 0-indexed
        })
    return snippet


def _pair_similarity_detail(
    analysis_a: FileAnalysis,
    analysis_b: FileAnalysis,
) -> Tuple[float, float, float, float]:
    """
    Return (final_score, ast_score, cfg_score, dfg_score) for a pair.

    If both FileAnalysis objects carry a ``normalised_tree``, the full
    three-layer advanced score is used.  Otherwise a plain Jaccard fallback
    is returned (with AST=Jaccard, CFG=0, DFG=0).
    """
    tree_a: Optional[_ast.AST] = analysis_a.normalised_tree
    tree_b: Optional[_ast.AST] = analysis_b.normalised_tree

    if tree_a is not None and tree_b is not None:
        adv = compute_advanced_similarity(
            analysis_a=analysis_a,
            analysis_b=analysis_b,
            normalised_tree_a=tree_a,
            normalised_tree_b=tree_b,
        )
        return (
            adv.final_similarity_score,
            adv.ast.similarity,
            adv.cfg.similarity,
            adv.dataflow.similarity,
        )

    # Fallback: plain AST Jaccard
    set_a = analysis_a.hash_set
    set_b = analysis_b.hash_set
    union = set_a | set_b
    jaccard = len(set_a & set_b) / len(union) if union else 0.0
    return (jaccard, jaccard, 0.0, 0.0)


def _matching_regions(
    analysis_a: FileAnalysis,
    analysis_b: FileAnalysis,
) -> List[Dict[str, Any]]:
    """Build the matched code-region list from the shared AST subtree hashes."""
    intersection = analysis_a.hash_set & analysis_b.hash_set
    matching_regions: List[Dict[str, Any]] = []
    seen = set()

    for common_hash in intersection:
        lines_a = analysis_a.hash_to_lines.get(common_hash, [])
        lines_b = analysis_b.hash_to_lines.get(common_hash, [])

        for la in lines_a:
            for lb in lines_b:
                # Skip root-level nodes with no real line info
                if la[0] == 0 or lb[0] == 0:
                    continue
                # Deduplicate by (file1_range, file2_range)
                key = (tuple(la), tuple(lb))
                if key in seen:
                    continue
                seen.add(key)

                # Extract actual source code with line numbers
                file1_snippet = _extract_code_snippet(
                    analysis_a.source_lines, la[0], la[1]
                )
                file2_snippet = _extract_code_snippet(
                    analysis_b.source_lines, lb[0], lb[1]
                )

                matching_regions.append({
                    "file1_lines": la,   # [start, end]
                    "file2_lines": lb,   # [start, end]
                    "file1_code": file1_snippet,
                    "file2_code": file2_snippet,
                })

    # Sort regions by file1 start line for readability
    matching_regions.sort(key=lambda r: r["file1_lines"][0])
    return matching_regions


def _maybe_run_llm(
    analysis_a: FileAnalysis,
    analysis_b: FileAnalysis,
    final_score: float,
    ast_score: float,
    cfg_score: float,
    dfg_score: float,
) -> Optional[Dict[str, Any]]:
    """
    Invoke the Gemini semantic judge if the structural similarity
    meets or exceeds the LLM threshold (0.70).

    Returns a dict with ``llm_verdict`` and ``refined_verdict`` keys,
    or None if the LLM was not invoked / is unavailable.
    """
    if not should_invoke_llm(final_score):
        return None

    code_a = "\n".join(analysis_a.source_lines)
    code_b = "\n".join(analysis_b.source_lines)

    scores = SimilarityScores(
        final_score=final_score,
        ast_score=ast_score,
        cfg_score=cfg_score,
        dfg_score=dfg_score,
    )

    verdict: Optional[LLMVerdict] = evaluate_pair(code_a, code_b, scores)

    if verdict is None:
        return None

    return {
        "llm_verdict": verdict_to_dict(verdict),
        "refined_verdict": compute_refined_verdict(final_score, verdict),
    }


def compute_similarity(
    analyses: Dict[str, FileAnalysis],
    threshold: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    Compare every pair of files using the advanced three-layer similarity
    engine (AST + CFG + DataFlow) and return suspicious pairs with matched
    source regions.

    When the structural similarity ≥ 0.70, the Gemini AI semantic judge is
    invoked to produce a refined verdict.

    The ``similarity_score`` in each result is the weighted combined score
    identical to what ``/analyze-advanced`` reports:

        score = 0.4 × AST_Jaccard + 0.3 × CFG_Jaccard + 0.3 × DataFlow_Jaccard

    Parameters
    ----------
    analyses : Dict[str, FileAnalysis]
        Mapping of filename → FileAnalysis (with ``normalised_tree`` set).
    threshold : float
        Minimum similarity to include a pair in results (default 0.5).

    Returns
    -------
    List[Dict]
        Sorted (desc) list of suspicious pairs with matching_regions
        that include source code snippets with line numbers.
    """
    filenames: List[str] = sorted(analyses.keys())
    results: List[Dict[str, Any]] = []

    # ── pairwise nested loop ─────────────────────────────────
    for i in range(len(filenames)):
        for j in range(i + 1, len(filenames)):
            name_a = filenames[i]
            name_b = filenames[j]
            analysis_a = analyses[name_a]
            analysis_b = analyses[name_b]

            final_score, ast_score, cfg_score, dfg_score = \
                _pair_similarity_detail(analysis_a, analysis_b)

            if final_score < threshold:
                continue

            pair_result: Dict[str, Any] = {
                "file1": name_a,
                "file2": name_b,
                "similarity_score": round(final_score, 4),
                "matching_regions": _matching_regions(analysis_a, analysis_b),
            }

            # ── LLM semantic judge (≥ 0.70) ─────────────────
            llm_data = _maybe_run_llm(
                analysis_a, analysis_b,
                final_score, ast_score, cfg_score, dfg_score,
            )
            if llm_data is not None:
                pair_result["llm_verdict"] = llm_data["llm_verdict"]
                pair_result["refined_verdict"] = llm_data["refined_verdict"]

            results.append(pair_result)

    # ── sort descending by similarity ────────────────────────
    results.sort(key=lambda r: r["similarity_score"], reverse=True)
    return results


def compute_cross_similarity(
    group_a: Dict[str, FileAnalysis],
    group_b: Dict[str, FileAnalysis],
    threshold: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    Compare every file in group_a against every file in group_b using the
    advanced three-layer similarity engine (AST + CFG + DataFlow).

    When the structural similarity ≥ 0.70, the Gemini AI semantic judge is
    invoked to produce a refined verdict.

    Only cross-group pairs are compared (never within the same group).

    Parameters
    ----------
    group_a : Dict[str, FileAnalysis]
        Files from the first user's ZIP / repo.
    group_b : Dict[str, FileAnalysis]
        Files from the second user's ZIP / repo.
    threshold : float
        Minimum similarity to include in results.

    Returns
    -------
    List[Dict]
        Sorted (desc) list of cross-group suspicious pairs.
    """
    results: List[Dict[str, Any]] = []

    for name_a, analysis_a in group_a.items():
        for name_b, analysis_b in group_b.items():
            final_score, ast_score, cfg_score, dfg_score = \
                _pair_similarity_detail(analysis_a, analysis_b)

            if final_score < threshold:
                continue

            pair_result: Dict[str, Any] = {
                "file1": name_a,
                "file2": name_b,
                "similarity_score": round(final_score, 4),
                "matching_regions": _matching_regions(analysis_a, analysis_b),
            }

            # ── LLM semantic judge (≥ 0.70) ─────────────────
            llm_data = _maybe_run_llm(
                analysis_a, analysis_b,
                final_score, ast_score, cfg_score, dfg_score,
            )
            if llm_data is not None:
                pair_result["llm_verdict"] = llm_data["llm_verdict"]
                pair_result["refined_verdict"] = llm_data["refined_verdict"]

            results.append(pair_result)

    results.sort(key=lambda r: r["similarity_score"], reverse=True)
    return results
