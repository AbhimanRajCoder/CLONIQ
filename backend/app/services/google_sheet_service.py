"""
google_sheet_service.py
═══════════════════════
Downloads a public Google Sheet as CSV and parses it into a list of
student repository records for batch plagiarism analysis.

Public API
──────────
parse_google_sheet_url(url)  → sheet_id
download_sheet_as_csv(url)   → csv text
parse_student_csv(csv_text)  → List[StudentRepo]

Safety
──────
• Timeout on HTTP requests (15s)
• Max 100 rows per sheet
• Deduplication + validation of URN and GitHub URL
• Clear error messages for every failure mode
"""

import csv
import io
import logging
import re
from dataclasses import dataclass
from typing import List, Tuple

import requests

logger = logging.getLogger(__name__)

# ── Safety limits ────────────────────────────────────────────
MAX_REPOS = 100
MIN_REPOS = 2
DOWNLOAD_TIMEOUT = 15  # seconds
MAX_CSV_BYTES = 2 * 1024 * 1024  # 2 MB


# ── Data types ───────────────────────────────────────────────

@dataclass
class StudentRepo:
    """A single student row parsed from the Google Sheet."""
    name: str
    urn: str
    github_url: str


# ── URL parsing ──────────────────────────────────────────────

_SHEET_ID_PATTERN = re.compile(
    r"docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)"
)


def parse_google_sheet_url(url: str) -> str:
    """
    Extract the Sheet ID from a Google Sheets URL.

    Supports:
      - https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
      - https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/...
      - https://docs.google.com/spreadsheets/d/SHEET_ID

    Raises ValueError on invalid URL.
    """
    url = url.strip()
    match = _SHEET_ID_PATTERN.search(url)
    if not match:
        raise ValueError(
            f"Invalid Google Sheets URL: '{url}'. "
            f"Expected format: https://docs.google.com/spreadsheets/d/SHEET_ID/..."
        )
    return match.group(1)


def _build_csv_export_url(sheet_id: str) -> str:
    """Build the public CSV export URL for a Google Sheet."""
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"


# ── Download ─────────────────────────────────────────────────

def download_sheet_as_csv(url: str) -> str:
    """
    Download a public Google Sheet as CSV text.

    Parameters
    ----------
    url : str
        The full Google Sheets URL (any variant).

    Returns
    -------
    str
        The raw CSV content.

    Raises
    ------
    ValueError
        If the URL is invalid.
    PermissionError
        If the sheet is not publicly accessible.
    TimeoutError
        If the request times out.
    RuntimeError
        For any other network/HTTP failure.
    """
    sheet_id = parse_google_sheet_url(url)
    export_url = _build_csv_export_url(sheet_id)

    logger.info("Downloading Google Sheet as CSV: %s", export_url)

    try:
        resp = requests.get(
            export_url,
            timeout=DOWNLOAD_TIMEOUT,
            allow_redirects=True,
            headers={"Accept": "text/csv"},
        )
    except requests.exceptions.Timeout:
        raise TimeoutError(
            f"Google Sheets download timed out after {DOWNLOAD_TIMEOUT}s. "
            f"The sheet may be too large or the server is slow."
        )
    except requests.exceptions.ConnectionError as exc:
        raise RuntimeError(f"Could not connect to Google Sheets: {exc}")
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Failed to download Google Sheet: {exc}")

    # ── Handle non-200 responses ─────────────────────────────
    if resp.status_code == 404:
        raise ValueError(
            f"Google Sheet not found (404). "
            f"Check that the Sheet ID is correct: {sheet_id}"
        )

    if resp.status_code in (401, 403):
        raise PermissionError(
            "The Google Sheet is not publicly accessible. "
            "Please set sharing to 'Anyone with the link can view'."
        )

    if resp.status_code != 200:
        raise RuntimeError(
            f"Google Sheets returned HTTP {resp.status_code}. "
            f"Response: {resp.text[:200]}"
        )

    # ── Check content type (Google may return HTML login page) ─
    content_type = resp.headers.get("Content-Type", "")
    if "text/html" in content_type:
        raise PermissionError(
            "Google returned an HTML page instead of CSV. "
            "The sheet is likely not shared publicly. "
            "Set sharing to 'Anyone with the link can view'."
        )

    # ── Size guard ───────────────────────────────────────────
    if len(resp.content) > MAX_CSV_BYTES:
        raise ValueError(
            f"CSV is too large ({len(resp.content)} bytes, max {MAX_CSV_BYTES}). "
            f"Reduce the number of rows."
        )

    csv_text = resp.content.decode("utf-8-sig")  # handle BOM
    logger.info("Downloaded CSV: %d bytes", len(csv_text))
    return csv_text


# ── CSV parsing ──────────────────────────────────────────────

_GITHUB_URL_PATTERN = re.compile(
    r"https?://github\.com/[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+"
)

_REQUIRED_COLUMNS = {"name", "urn", "github_url"}


def parse_student_csv(csv_text: str) -> Tuple[List[StudentRepo], List[str]]:
    """
    Parse CSV text into a validated list of StudentRepo records.

    Parameters
    ----------
    csv_text : str
        Raw CSV content with columns: name, urn, github_url

    Returns
    -------
    Tuple[List[StudentRepo], List[str]]
        (valid_repos, warnings)

    Raises
    ------
    ValueError
        On missing columns, too few repos, duplicates, etc.
    """
    reader = csv.DictReader(io.StringIO(csv_text))

    # ── Validate headers ─────────────────────────────────────
    if reader.fieldnames is None:
        raise ValueError("CSV is empty or has no header row.")

    # Normalize column names (strip whitespace, lowercase)
    normalised_headers = {h.strip().lower() for h in reader.fieldnames}
    missing = _REQUIRED_COLUMNS - normalised_headers
    if missing:
        raise ValueError(
            f"CSV is missing required columns: {', '.join(sorted(missing))}. "
            f"Found columns: {', '.join(reader.fieldnames)}. "
            f"Required: name, urn, github_url"
        )

    # ── Parse rows ───────────────────────────────────────────
    repos: List[StudentRepo] = []
    warnings: List[str] = []
    seen_urns: dict = {}
    seen_urls: dict = {}

    for row_num, raw_row in enumerate(reader, start=2):
        # Normalise keys
        row = {k.strip().lower(): (v or "").strip() for k, v in raw_row.items()}

        name = row.get("name", "").strip()
        urn = row.get("urn", "").strip()
        github_url = row.get("github_url", "").strip()

        # Skip entirely empty rows
        if not name and not urn and not github_url:
            continue

        # ── Validate individual fields ───────────────────────
        if not name:
            warnings.append(f"Row {row_num}: missing name — skipped.")
            continue
        if not urn:
            warnings.append(f"Row {row_num}: missing URN — skipped.")
            continue
        if not github_url:
            warnings.append(f"Row {row_num} ({name}): missing github_url — skipped.")
            continue

        # Validate GitHub URL format
        if not _GITHUB_URL_PATTERN.match(github_url):
            warnings.append(
                f"Row {row_num} ({name}): invalid GitHub URL '{github_url}' — skipped."
            )
            continue

        # ── Duplicate checks ─────────────────────────────────
        urn_lower = urn.lower()
        if urn_lower in seen_urns:
            warnings.append(
                f"Row {row_num} ({name}): duplicate URN '{urn}' "
                f"(first seen: {seen_urns[urn_lower]}) — skipped."
            )
            continue
        seen_urns[urn_lower] = name

        url_normalised = github_url.rstrip("/").lower()
        if url_normalised in seen_urls:
            warnings.append(
                f"Row {row_num} ({name}): duplicate GitHub URL — skipped."
            )
            continue
        seen_urls[url_normalised] = name

        repos.append(StudentRepo(name=name, urn=urn, github_url=github_url))

        # ── Max repos guard ──────────────────────────────────
        if len(repos) >= MAX_REPOS:
            warnings.append(
                f"Reached maximum of {MAX_REPOS} repositories. "
                f"Remaining rows ignored."
            )
            break

    # ── Final validation ─────────────────────────────────────
    if len(repos) == 0:
        raise ValueError(
            "No valid repository entries found in the sheet. "
            "Ensure the sheet has columns: name, urn, github_url "
            "with at least 2 valid rows."
        )

    if len(repos) < MIN_REPOS:
        raise ValueError(
            f"At least {MIN_REPOS} valid repositories are required "
            f"for comparison. Found only {len(repos)}."
        )

    logger.info(
        "Parsed %d valid repos from CSV (%d warnings)",
        len(repos), len(warnings),
    )
    return repos, warnings
