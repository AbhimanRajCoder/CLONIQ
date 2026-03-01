import logging
import os
import zipfile
from typing import Any, Dict, List, Set

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, Depends
from app.api.dependencies.auth import get_current_user

from app.models.schemas import GitHubCompareRequest, GoogleSheetRequest
from app.services.google_sheet_service import (
    download_sheet_as_csv,
    parse_student_csv,
    StudentRepo,
)
from app.services.advanced_similarity import build_advanced_response, compute_advanced_similarity
from app.services.llm_judge import (
    SimilarityScores,
    compute_refined_verdict,
    evaluate_pair,
    should_invoke_llm,
    verdict_to_dict,
)
from app.services.analysis_orchestrator import run_unified_analysis
from app.services.ast_parser import generate_subtree_hashes, parse_code
from app.services.github_service import fetch_repo_py_files, parse_repo_url
from app.services.metrics import compute_ast_metrics
from app.services.normalizer import normalize_ast
from app.services.similarity import compute_cross_similarity, compute_similarity
from app.utils.types import FileAnalysis
from app.services.visualization import ast_to_tree_json
from app.utils.zip_handler import extract_py_files
from app.services.language_detector import is_supported, SUPPORTED_EXTENSIONS
from app.services.parsers import parse_source
from app.services.unified_normalizer import normalize_ir
from app.services.unified_hasher import hash_ir

router = APIRouter()

# ── In-memory store keyed by analysis_id ─────────────────────
# Allows GET endpoints to retrieve a specific past analysis.
_analysis_store: Dict[str, Dict[str, Any]] = {}
_file_analysis_store: Dict[str, Dict[str, FileAnalysis]] = {}


def _process_source(
    filename: str,
    source_code: str,
    analyses: Dict[str, FileAnalysis],
    errors: List[Dict[str, str]],
) -> None:
    """
    Parse → Normalise → Hash a single source file.
    Populates `analyses` on success, appends to `errors` on failure.
    Also computes structural metrics per file.

    Supports Python (.py) and JS/TS (.js, .jsx, .ts, .tsx) files.
    Python files use the original ast pipeline for backward compatibility.
    JS/TS files use the Unified IR pipeline via Tree-sitter.
    """
    # Check if supported
    if not is_supported(filename):
        errors.append({"file": filename, "error": "Unsupported file type – skipped."})
        return

    if filename.endswith(".py"):
        # ── Legacy Python path (unchanged) ───────────────────
        try:
            tree = parse_code(source_code, filename=filename)
        except SyntaxError as exc:
            errors.append({
                "file": filename,
                "error": f"Syntax error: {exc.msg} (line {exc.lineno})",
            })
            return

        normalized_tree = normalize_ast(tree)
        analysis = generate_subtree_hashes(normalized_tree)
        analysis.filename = filename
        analysis.source_lines = source_code.splitlines()
        analysis.metrics = compute_ast_metrics(tree)
        analysis.normalised_tree = normalized_tree
        analyses[filename] = analysis
    else:
        # ── Unified IR path (JS / TS / JSX / TSX) ────────────
        try:
            ir = parse_source(source_code, filename)
        except Exception as exc:
            errors.append({
                "file": filename,
                "error": f"Parse error: {str(exc)}",
            })
            return

        normalized_ir = normalize_ir(ir)
        analysis = hash_ir(normalized_ir)
        analysis.filename = filename
        analysis.source_lines = source_code.splitlines()
        analysis.metrics = {}  # metrics computed differently for JS
        analysis.normalised_tree = None  # no Python AST
        analyses[filename] = analysis


def _store_and_return(result: Dict[str, Any], analyses: Dict[str, FileAnalysis] = None) -> Dict[str, Any]:
    """Cache the analysis result by its ID and return it."""
    aid = result["analysis_id"]
    _analysis_store[aid] = result
    if analyses:
        _file_analysis_store[aid] = analyses
    return result


@router.post("/analyze", tags=["Analysis"])
async def analyze(files: List[UploadFile] = File(...), current_user: dict = Depends(get_current_user)):
    if len(files) < 2:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least 2 code files to compare.",
        )

    analyses: Dict[str, FileAnalysis] = {}
    errors: List[Dict[str, str]] = []

    for upload in files:
        filename = upload.filename or "unknown.py"

        if not is_supported(filename):
            errors.append({"file": filename, "error": "Unsupported file type – skipped."})
            continue

        raw_bytes = await upload.read()
        try:
            source_code = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            errors.append({"file": filename, "error": "Could not decode as UTF-8."})
            continue

        _process_source(filename, source_code, analyses, errors)

    result = run_unified_analysis(
        analyses=analyses,
        errors=errors,
        analysis_type="multi_file",
        similarity_fn=compute_similarity,
        similarity_kwargs={"analyses": analyses, "threshold": 0.5},
    )

    return _store_and_return(result, analyses)


@router.post("/analyze-pair", tags=["Analysis"])
async def analyze_pair(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    analyses: Dict[str, FileAnalysis] = {}
    errors: List[Dict[str, str]] = []

    for upload in [file1, file2]:
        filename = upload.filename or "unknown.py"
        if not is_supported(filename):
            errors.append({"file": filename, "error": "Unsupported file type."})
            continue

        raw_bytes = await upload.read()
        try:
            source_code = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            errors.append({"file": filename, "error": "Could not decode as UTF-8."})
            continue

        _process_source(filename, source_code, analyses, errors)

    if len(analyses) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process both files. Errors: {errors}",
        )

    result = run_unified_analysis(
        analyses=analyses,
        errors=errors,
        analysis_type="pair",
        similarity_fn=compute_similarity,
        similarity_kwargs={"analyses": analyses, "threshold": 0.0},
    )

    return _store_and_return(result, analyses)


@router.post("/demo-analyze-pair", tags=["Analysis", "Demo"])
async def demo_analyze_pair(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
):
    analyses: Dict[str, FileAnalysis] = {}
    errors: List[Dict[str, str]] = []

    for upload in [file1, file2]:
        filename = upload.filename or "unknown.py"
        if not is_supported(filename):
            errors.append({"file": filename, "error": "Unsupported file type."})
            continue

        raw_bytes = await upload.read()
        try:
            source_code = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            errors.append({"file": filename, "error": "Could not decode as UTF-8."})
            continue

        _process_source(filename, source_code, analyses, errors)

    if len(analyses) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process both files. Errors: {errors}",
        )

    result = run_unified_analysis(
        analyses=analyses,
        errors=errors,
        analysis_type="demo_pair",
        similarity_fn=compute_similarity,
        similarity_kwargs={"analyses": analyses, "threshold": 0.0},
    )

    return _store_and_return(result, analyses)


@router.post("/analyze-advanced", tags=["Analysis"])
async def analyze_advanced(
    file1: UploadFile = File(..., description="First Python (.py) file"),
    file2: UploadFile = File(..., description="Second Python (.py) file"),
    current_user: dict = Depends(get_current_user),
):
    uploads = [(file1, file1.filename or "file1.py"),
               (file2, file2.filename or "file2.py")]

    analyses: Dict[str, FileAnalysis] = {}
    normalised_trees: Dict[str, Any] = {}
    errors: List[Dict[str, str]] = []

    for upload, filename in uploads:
        if not is_supported(filename):
            raise HTTPException(
                status_code=400,
                detail=f"'{filename}' is not a supported file. Accepted: {sorted(SUPPORTED_EXTENSIONS)}",
            )

        raw_bytes = await upload.read()
        try:
            source_code = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400,
                detail=f"Could not decode '{filename}' as UTF-8.",
            )

        try:
            raw_tree = parse_code(source_code, filename=filename)
        except SyntaxError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Syntax error in '{filename}': {exc.msg} (line {exc.lineno})",
            )

        norm_tree = normalize_ast(raw_tree)
        analysis = generate_subtree_hashes(norm_tree)
        analysis.filename = filename
        analysis.source_lines = source_code.splitlines()
        analysis.metrics = compute_ast_metrics(raw_tree)
        analyses[filename] = analysis
        normalised_trees[filename] = norm_tree

    if len(analyses) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process both files. Errors: {errors}",
        )

    names = list(analyses.keys())
    name_a, name_b = names[0], names[1]

    adv_result = compute_advanced_similarity(
        analysis_a=analyses[name_a],
        analysis_b=analyses[name_b],
        normalised_tree_a=normalised_trees[name_a],
        normalised_tree_b=normalised_trees[name_b],
    )

    response = build_advanced_response(
        file1_name=name_a,
        file2_name=name_b,
        result=adv_result,
        normalization_applied=True,
        dead_code_removed=True,
    )

    # ── Gemini LLM semantic judge (≥ 0.70) ───────────────
    final_score = adv_result.final_similarity_score
    if should_invoke_llm(final_score):
        code_a = "\n".join(analyses[name_a].source_lines)
        code_b = "\n".join(analyses[name_b].source_lines)
        scores = SimilarityScores(
            final_score=final_score,
            ast_score=adv_result.ast.similarity,
            cfg_score=adv_result.cfg.similarity,
            dfg_score=adv_result.dataflow.similarity,
        )
        verdict = evaluate_pair(code_a, code_b, scores)
        if verdict is not None:
            response["llm_verdict"] = verdict_to_dict(verdict)
            response["refined_verdict"] = compute_refined_verdict(
                final_score, verdict
            )

    return response


@router.post("/compare-zips", tags=["Analysis"])
async def compare_zips(
    zip1: UploadFile = File(..., description="First user's ZIP of .py files"),
    zip2: UploadFile = File(..., description="Second user's ZIP of .py files"),
    current_user: dict = Depends(get_current_user),
):
    errors: List[Dict[str, str]] = []

    async def _process_zip(
        upload: UploadFile, label: str
    ) -> Dict[str, FileAnalysis]:
        fname = upload.filename or ""
        if not fname.endswith(".zip"):
            raise HTTPException(
                status_code=400,
                detail=f"{label}: Please upload a .zip file (got '{fname}').",
            )

        raw = await upload.read()
        try:
            py_files = extract_py_files(raw)
        except zipfile.BadZipFile:
            raise HTTPException(
                status_code=400,
                detail=f"{label}: Not a valid ZIP archive.",
            )

        if not py_files:
            raise HTTPException(
                status_code=400,
                detail=f"{label}: No .py files found in ZIP.",
            )

        analyses: Dict[str, FileAnalysis] = {}
        for name, source in py_files.items():
            prefixed = f"{label}/{name}"
            _process_source(prefixed, source, analyses, errors)
        return analyses

    group_a = await _process_zip(zip1, zip1.filename or "user1")
    group_b = await _process_zip(zip2, zip2.filename or "user2")

    all_analyses = {**group_a, **group_b}

    result = run_unified_analysis(
        analyses=all_analyses,
        errors=errors,
        analysis_type="zip_cross",
        similarity_fn=compute_cross_similarity,
        similarity_kwargs={
            "group_a": group_a,
            "group_b": group_b,
            "threshold": 0.5,
        },
        extra_summary={
            "user1_zip": zip1.filename,
            "user2_zip": zip2.filename,
            "user1_files": len(group_a),
            "user2_files": len(group_b),
        },
    )

    return _store_and_return(result, all_analyses)


@router.post("/compare-github-repos", tags=["GitHub"])
async def compare_github_repos(
    body: GitHubCompareRequest,
    current_user: dict = Depends(get_current_user),
):
    errors: List[Dict[str, str]] = []

    def _process_repo(repo_url: str, label: str) -> Dict[str, FileAnalysis]:
        try:
            py_files = fetch_repo_py_files(repo_url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=429, detail=str(exc))
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to fetch {label}: {exc}",
            )

        analyses: Dict[str, FileAnalysis] = {}
        for path, source in py_files.items():
            prefixed = f"{label}/{path}"
            _process_source(prefixed, source, analyses, errors)
        return analyses

    try:
        owner1, repo1 = parse_repo_url(body.repo_url_1)
        owner2, repo2 = parse_repo_url(body.repo_url_2)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    label1 = f"{owner1}/{repo1}"
    label2 = f"{owner2}/{repo2}"

    group_a = _process_repo(body.repo_url_1, label1)
    group_b = _process_repo(body.repo_url_2, label2)

    if not group_a:
        raise HTTPException(status_code=400, detail=f"No parseable Python files found in {label1}.")
    if not group_b:
        raise HTTPException(status_code=400, detail=f"No parseable Python files found in {label2}.")

    merged_a: Set[str] = set()
    for a in group_a.values():
        merged_a |= a.hash_set

    merged_b: Set[str] = set()
    for b in group_b.values():
        merged_b |= b.hash_set

    union = merged_a | merged_b
    overall = len(merged_a & merged_b) / len(union) if union else 0.0

    all_analyses = {**group_a, **group_b}

    result = run_unified_analysis(
        analyses=all_analyses,
        errors=errors,
        analysis_type="github_cross",
        similarity_fn=compute_cross_similarity,
        similarity_kwargs={
            "group_a": group_a,
            "group_b": group_b,
            "threshold": 0.5,
        },
        extra_summary={
            "repo_1": body.repo_url_1,
            "repo_2": body.repo_url_2,
            "repo_1_files": len(group_a),
            "repo_2_files": len(group_b),
            "overall_similarity": round(overall, 4),
        },
    )

    return _store_and_return(result, all_analyses)


# ═══════════════════════════════════════════════════════════════
#  Google Sheet Batch Analysis
# ═══════════════════════════════════════════════════════════════

_gsheet_logger = logging.getLogger("google_sheet_analysis")


@router.post("/analyze-google-sheet", tags=["Batch", "GitHub"])
async def analyze_google_sheet(
    body: GoogleSheetRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Batch plagiarism analysis from a public Google Sheet.

    The sheet must have columns: **name**, **urn**, **github_url**.
    Each row represents one student repository.

    The endpoint will:
    1. Download the Google Sheet as CSV
    2. Parse & validate the entries
    3. Fetch Python files from each GitHub repository
    4. Run pairwise structural similarity (AST + CFG + DataFlow)
    5. Invoke Gemini AI semantic judge for pairs >= 0.70
    6. Return a unified batch report
    """
    # ── Step 1: Download CSV ──────────────────────────────────
    try:
        csv_text = download_sheet_as_csv(body.google_sheet_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # ── Step 2: Parse CSV ─────────────────────────────────────
    try:
        repos, csv_warnings = parse_student_csv(csv_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    _gsheet_logger.info(
        "Processing %d repositories from Google Sheet", len(repos)
    )

    # ── Step 3: Fetch Python files for each repo ──────────────
    errors: List[Dict[str, str]] = []
    repo_groups: Dict[str, Dict[str, FileAnalysis]] = {}
    repo_metadata: List[Dict[str, str]] = []
    fetch_errors: List[Dict[str, str]] = []

    for student in repos:
        label = f"{student.name} ({student.urn})"
        _gsheet_logger.info("Fetching: %s -> %s", label, student.github_url)

        try:
            py_files = fetch_repo_py_files(student.github_url)
        except ValueError as exc:
            fetch_errors.append({
                "student": label,
                "github_url": student.github_url,
                "error": str(exc),
            })
            continue
        except RuntimeError as exc:
            fetch_errors.append({
                "student": label,
                "github_url": student.github_url,
                "error": f"Rate limit: {exc}",
            })
            continue
        except Exception as exc:
            fetch_errors.append({
                "student": label,
                "github_url": student.github_url,
                "error": f"Fetch failed: {exc}",
            })
            continue

        if not py_files:
            fetch_errors.append({
                "student": label,
                "github_url": student.github_url,
                "error": "No Python files found.",
            })
            continue

        # Process each Python file from this student's repo
        analyses: Dict[str, FileAnalysis] = {}
        for path, source in py_files.items():
            prefixed = f"{label}/{path}"
            _process_source(prefixed, source, analyses, errors)

        if analyses:
            repo_groups[label] = analyses
            repo_metadata.append({
                "name": student.name,
                "urn": student.urn,
                "github_url": student.github_url,
                "files_count": str(len(analyses)),
            })

    # ── Validate we have enough repos ─────────────────────────
    if len(repo_groups) < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need at least 2 successfully fetched repositories for comparison. "
                f"Only {len(repo_groups)} succeeded. "
                f"Fetch errors: {fetch_errors}"
            ),
        )

    # ── Step 4: Pairwise cross-comparison ─────────────────────
    all_analyses: Dict[str, FileAnalysis] = {}
    for group in repo_groups.values():
        all_analyses.update(group)

    labels = sorted(repo_groups.keys())
    all_pairs: List[Dict[str, Any]] = []

    for i in range(len(labels)):
        for j in range(i + 1, len(labels)):
            group_a = repo_groups[labels[i]]
            group_b = repo_groups[labels[j]]
            pair_results = compute_cross_similarity(
                group_a=group_a,
                group_b=group_b,
                threshold=0.5,
            )
            all_pairs.extend(pair_results)

    # Sort all pairs by similarity descending
    all_pairs.sort(key=lambda p: p["similarity_score"], reverse=True)

    # ── Step 5: Build unified result ──────────────────────────
    result = run_unified_analysis(
        analyses=all_analyses,
        errors=errors,
        analysis_type="google_sheet_batch",
        similarity_fn=lambda: all_pairs,  # pre-computed
        extra_summary={
            "source": "google_sheet",
            "google_sheet_url": body.google_sheet_url,
            "total_repositories": len(repo_groups),
            "total_students": len(repos),
            "successfully_fetched": len(repo_groups),
            "failed_fetches": len(fetch_errors),
        },
    )

    # Attach batch-specific metadata
    result["batch_metadata"] = {
        "students": repo_metadata,
        "fetch_errors": fetch_errors,
        "csv_warnings": csv_warnings,
        "total_comparisons": len(all_pairs),
    }

    return _store_and_return(result, all_analyses)


@router.post("/visualize-ast", tags=["Visualization"])
async def visualize_ast(file: UploadFile = File(...)):
    filename = file.filename or "unknown.py"
    if not filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="Only .py files are accepted.")

    raw_bytes = await file.read()
    try:
        source_code = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Could not decode file as UTF-8.")

    try:
        tree = parse_code(source_code, filename=filename)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Syntax error: {exc.msg} (line {exc.lineno})",
        )

    normalized_tree = normalize_ast(tree)
    tree_json = ast_to_tree_json(normalized_tree)

    return {"filename": filename, "ast_tree": tree_json}


@router.post("/structure-summary", tags=["Analytics"])
async def structure_summary(file: UploadFile = File(...)):
    filename = file.filename or "unknown.py"
    if not filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="Only .py files are accepted.")

    raw_bytes = await file.read()
    try:
        source_code = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Could not decode file as UTF-8.")

    analyses: Dict[str, FileAnalysis] = {}
    errors: List[Dict[str, str]] = []
    _process_source(filename, source_code, analyses, errors)

    if filename not in analyses:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {errors}")

    analysis = analyses[filename]
    return {
        "file": filename,
        "metrics": analysis.metrics,
        "total_subtrees": len(analysis.subtree_infos),
        "unique_subtrees": len(analysis.hash_set),
    }


def _get_analysis(analysis_id: str) -> Dict[str, Any]:
    if not analysis_id:
        raise HTTPException(
            status_code=400,
            detail="analysis_id is required. Use the analysis_id from the POST response.",
        )
    if analysis_id not in _analysis_store:
        raise HTTPException(status_code=404, detail=f"Analysis '{analysis_id}' not found.")
    return _analysis_store[analysis_id]


@router.get("/similarity-graph", tags=["Analytics"])
async def similarity_graph(analysis_id: str = Query(..., description="UUID from POST analysis response")):
    result = _get_analysis(analysis_id)
    return result["similarity"]["graph"]


@router.get("/similarity-matrix", tags=["Analytics"])
async def similarity_matrix(analysis_id: str = Query(..., description="UUID from POST analysis response")):
    result = _get_analysis(analysis_id)
    return {
        "files": result["similarity"]["matrix"]["files"],
        "matrix": result["similarity"]["matrix"]["values"],
    }


@router.get("/clusters", tags=["Analytics"])
async def clusters(analysis_id: str = Query(..., description="UUID from POST analysis response")):
    result = _get_analysis(analysis_id)
    return {"clusters": result["similarity"]["clusters"]}


@router.get("/analysis/{analysis_id}/ast", tags=["Analytics"])
async def get_analysis_ast(analysis_id: str, file: str = Query(...)):
    """Retrieve the raw AST JSON for a specific file inside a past analysis."""
    if analysis_id not in _file_analysis_store:
        raise HTTPException(status_code=404, detail=f"Analysis '{analysis_id}' not found or has expired from cache.")
    
    analyses = _file_analysis_store[analysis_id]
    if file not in analyses:
        raise HTTPException(status_code=404, detail=f"File '{file}' not found in this analysis.")
        
    analysis = analyses[file]
    if not analysis.normalised_tree:
        raise HTTPException(status_code=400, detail="AST tree not available for this file.")
        
    tree_json = ast_to_tree_json(analysis.normalised_tree)
    return {"filename": file, "ast_tree": tree_json}

