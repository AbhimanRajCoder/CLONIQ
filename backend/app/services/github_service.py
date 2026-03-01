"""github_service.py
─────────────────
Fetches source files (Python, JS, TS, JSX, TSX) from public
GitHub repositories using the GitHub REST API. Works entirely in-memory.

Requires: `requests` library.
Optional: GITHUB_TOKEN env var for higher rate limits (5k/hr vs 60/hr).
"""

import os
import re
from typing import Any, Dict, List, Optional, Tuple

import requests

# ── Configuration ────────────────────────────────────────────
GITHUB_TOKEN: Optional[str] = os.getenv("GITHUB_TOKEN") or None

# Safety limits
MAX_FILES_PER_REPO = 100
MAX_FILE_SIZE_BYTES = 200 * 1024  # 200 KB

# Directories to ignore when scanning repo tree
IGNORED_DIRS = {
    ".git", "venv", "env", ".venv", ".env",
    "__pycache__", "node_modules", ".tox",
    "dist", "build", "egg-info",
    ".mypy_cache", ".pytest_cache",
}

# ── Helpers ──────────────────────────────────────────────────

def _headers() -> Dict[str, str]:
    """Build request headers with optional auth token."""
    h = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"token {GITHUB_TOKEN}"
    return h


def _check_rate_limit(resp: requests.Response) -> None:
    """Raise a clear error if we hit the GitHub API rate limit."""
    if resp.status_code == 403 and "rate limit" in resp.text.lower():
        remaining = resp.headers.get("X-RateLimit-Remaining", "?")
        reset = resp.headers.get("X-RateLimit-Reset", "?")
        raise RuntimeError(
            f"GitHub API rate limit exceeded. "
            f"Remaining: {remaining}, Resets at: {reset}. "
            f"Set GITHUB_TOKEN in .env to increase limits."
        )


def parse_repo_url(url: str) -> Tuple[str, str]:
    """
    Extract (owner, repo) from a GitHub URL.

    Supports:
      - https://github.com/owner/repo
      - https://github.com/owner/repo.git
      - https://github.com/owner/repo/tree/branch/...
    """
    url = url.strip().rstrip("/")
    # Remove trailing .git
    if url.endswith(".git"):
        url = url[:-4]

    pattern = r"github\.com/([^/]+)/([^/]+)"
    match = re.search(pattern, url)
    if not match:
        raise ValueError(
            f"Invalid GitHub URL: '{url}'. "
            f"Expected format: https://github.com/owner/repo"
        )
    return match.group(1), match.group(2)


def get_default_branch(owner: str, repo: str) -> str:
    """Fetch the default branch name for a repository."""
    url = f"https://api.github.com/repos/{owner}/{repo}"
    resp = requests.get(url, headers=_headers(), timeout=15)
    _check_rate_limit(resp)

    if resp.status_code == 404:
        raise ValueError(f"Repository not found: {owner}/{repo}")
    resp.raise_for_status()

    return resp.json().get("default_branch", "main")


def _should_ignore(path: str) -> bool:
    """Check if a file path should be ignored based on directory rules."""
    parts = path.split("/")
    for part in parts:
        if part in IGNORED_DIRS:
            return True
    return False


# Supported code file extensions
_CODE_EXTENSIONS = (".py", ".js", ".jsx", ".ts", ".tsx")


def get_py_file_paths(owner: str, repo: str, branch: str) -> List[Dict[str, Any]]:
    """Legacy alias – now fetches all supported code files."""
    return get_code_file_paths(owner, repo, branch)


def get_code_file_paths(owner: str, repo: str, branch: str) -> List[Dict[str, Any]]:
    """
    Fetch the full file tree for a repo and return metadata for all
    supported code files (.py, .js, .jsx, .ts, .tsx).

    Returns a list of dicts with keys: path, size, sha
    Limited to MAX_FILES_PER_REPO files.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    resp = requests.get(url, headers=_headers(), timeout=30)
    _check_rate_limit(resp)

    if resp.status_code == 404:
        raise ValueError(
            f"Could not fetch tree for {owner}/{repo} (branch: {branch}). "
            f"Is this a public repository?"
        )
    resp.raise_for_status()

    tree = resp.json().get("tree", [])
    code_files: List[Dict[str, Any]] = []

    for entry in tree:
        if entry.get("type") != "blob":
            continue
        path = entry.get("path", "")
        if not any(path.endswith(ext) for ext in _CODE_EXTENSIONS):
            continue
        if _should_ignore(path):
            continue

        size = entry.get("size", 0)
        if size > MAX_FILE_SIZE_BYTES:
            continue

        code_files.append({
            "path": path,
            "size": size,
            "sha": entry.get("sha", ""),
        })

        if len(code_files) >= MAX_FILES_PER_REPO:
            break

    return code_files


def fetch_file_content(owner: str, repo: str, branch: str, path: str) -> Optional[str]:
    """
    Fetch raw file content from GitHub using raw.githubusercontent.com.

    Returns the file content as a string, or None if the fetch fails.
    """
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            return None
        return resp.text
    except requests.RequestException:
        return None


def fetch_repo_py_files(repo_url: str) -> Dict[str, str]:
    """Legacy alias – now fetches all supported code files."""
    return fetch_repo_code_files(repo_url)


def fetch_repo_code_files(repo_url: str) -> Dict[str, str]:
    """
    High-level function: given a GitHub repo URL, return a dict of
    filename → source code for all supported code files in the repository.

    This is the main entry point for the GitHub service.
    """
    owner, repo = parse_repo_url(repo_url)
    branch = get_default_branch(owner, repo)
    file_metas = get_code_file_paths(owner, repo, branch)

    if not file_metas:
        raise ValueError(
            f"No supported code files found in {owner}/{repo} (branch: {branch}). "
            f"Supported extensions: {_CODE_EXTENSIONS}"
        )

    code_files: Dict[str, str] = {}
    for meta in file_metas:
        path = meta["path"]
        content = fetch_file_content(owner, repo, branch, path)
        if content is not None:
            code_files[path] = content

    return code_files
