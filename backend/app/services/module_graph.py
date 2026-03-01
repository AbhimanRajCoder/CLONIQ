"""
module_graph.py
───────────────
Builds and compares import/module dependency graphs for multi-file
JS/TS projects.

For each project, the graph captures:
  - Which files import which other files
  - Directory structure hashes
  - Framework-specific module patterns

The module graph similarity is the Jaccard similarity of the
hashed edge sets of the two import graphs.

Public API
----------
build_import_graph(files)            → ImportGraph
compute_module_similarity(g1, g2)    → ModuleGraphResult
"""

import hashlib
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, FrozenSet, List, Set, Tuple


@dataclass
class ImportGraph:
    """Represents the import graph for a set of files."""
    edges: FrozenSet[Tuple[str, str]]         # (importer, imported)
    edge_hashes: FrozenSet[str]               # SHA-256 of each edge
    file_count: int
    directory_hash: str                        # hash of the directory tree


@dataclass
class ModuleGraphResult:
    """Result of comparing two import graphs."""
    similarity: float
    edges_project1: int
    edges_project2: int
    shared_edges: int


# ── Import extraction patterns ───────────────────────────────

# JS/TS import patterns:
#   import X from './path'
#   import { X } from './path'
#   const X = require('./path')
#   import('./path')
_JS_IMPORT_RE = re.compile(
    r"""(?:
        import\s+.*?\s+from\s+['"]([^'"]+)['"]    |  # import X from '...'
        import\s*\(\s*['"]([^'"]+)['"]\s*\)        |  # dynamic import('...')
        require\s*\(\s*['"]([^'"]+)['"]\s*\)           # require('...')
    )""",
    re.VERBOSE,
)

# Python import patterns:
#   import foo
#   from foo import bar
_PY_IMPORT_RE = re.compile(
    r"""(?:
        from\s+([\w.]+)\s+import  |  # from X import ...
        import\s+([\w.]+)             # import X
    )""",
    re.VERBOSE,
)


def _normalise_import_path(importer: str, imported: str) -> str:
    """Normalise a relative import path to a canonical form."""
    # Remove file extensions
    imported = re.sub(r"\.(js|jsx|ts|tsx|py)$", "", imported)

    # Resolve relative paths
    if imported.startswith("./") or imported.startswith("../"):
        base_dir = os.path.dirname(importer)
        resolved = os.path.normpath(os.path.join(base_dir, imported))
        return resolved.replace("\\", "/")

    # Package imports – keep as-is
    return imported


def _extract_imports(filename: str, source: str, language: str) -> List[str]:
    """Extract import targets from a source file."""
    imports: List[str] = []

    if language in ("javascript", "typescript"):
        for match in _JS_IMPORT_RE.finditer(source):
            raw = match.group(1) or match.group(2) or match.group(3)
            if raw:
                imports.append(_normalise_import_path(filename, raw))
    elif language == "python":
        for match in _PY_IMPORT_RE.finditer(source):
            raw = match.group(1) or match.group(2)
            if raw:
                imports.append(raw)

    return imports


def _hash_directory_structure(filenames: List[str]) -> str:
    """Hash the directory tree structure (without file contents)."""
    dirs: Set[str] = set()
    for f in sorted(filenames):
        parts = f.replace("\\", "/").split("/")
        for i in range(1, len(parts)):
            dirs.add("/".join(parts[:i]))

    structure = "\n".join(sorted(dirs))
    return hashlib.sha256(structure.encode("utf-8")).hexdigest()


def build_import_graph(
    files: Dict[str, str],
    language: str = "javascript",
) -> ImportGraph:
    """Build the import graph from a set of files.

    Parameters
    ----------
    files : Dict[str, str]
        Mapping of filename → source code.
    language : str
        The language of the files.

    Returns
    -------
    ImportGraph
    """
    edges: Set[Tuple[str, str]] = set()
    filenames = list(files.keys())

    for filename, source in files.items():
        targets = _extract_imports(filename, source, language)
        for target in targets:
            edges.add((filename, target))

    # Hash each edge
    edge_hashes: Set[str] = set()
    for src, dst in edges:
        # Normalise edge by only keeping the structural relationship
        edge_str = f"{os.path.basename(src)}→{os.path.basename(dst)}"
        h = hashlib.sha256(edge_str.encode("utf-8")).hexdigest()
        edge_hashes.add(h)

    dir_hash = _hash_directory_structure(filenames)

    return ImportGraph(
        edges=frozenset(edges),
        edge_hashes=frozenset(edge_hashes),
        file_count=len(files),
        directory_hash=dir_hash,
    )


def compute_module_similarity(
    graph_a: ImportGraph,
    graph_b: ImportGraph,
) -> ModuleGraphResult:
    """Compute module graph similarity between two import graphs."""
    set_a = graph_a.edge_hashes
    set_b = graph_b.edge_hashes

    intersection = set_a & set_b
    union = set_a | set_b

    similarity = len(intersection) / len(union) if union else 0.0

    # Also factor in directory structure similarity
    dir_match = 1.0 if graph_a.directory_hash == graph_b.directory_hash else 0.0
    # Weighted: 80% import edges + 20% directory structure
    combined = 0.8 * similarity + 0.2 * dir_match

    return ModuleGraphResult(
        similarity=round(combined, 6),
        edges_project1=len(set_a),
        edges_project2=len(set_b),
        shared_edges=len(intersection),
    )
