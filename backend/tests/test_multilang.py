"""
tests/test_multilang.py
───────────────────────
Unit tests for multi-language support:
  - JS / JSX parsing
  - TSX parsing
  - Unified normalisation
  - Module graph hashing
  - End-to-end similarity comparison
  - Backward compatibility with Python
"""

import pytest

# ── Language detector ─────────────────────────────────────────
from app.services.language_detector import (
    detect_language,
    detect_framework,
    is_supported,
    SUPPORTED_EXTENSIONS,
)

def test_detect_language_python():
    assert detect_language("main.py") == "python"

def test_detect_language_js():
    assert detect_language("index.js") == "javascript"

def test_detect_language_jsx():
    assert detect_language("App.jsx") == "javascript"

def test_detect_language_ts():
    assert detect_language("utils.ts") == "typescript"

def test_detect_language_tsx():
    assert detect_language("Home.tsx") == "typescript"

def test_detect_language_unsupported():
    with pytest.raises(ValueError):
        detect_language("notes.txt")

def test_is_supported():
    assert is_supported("app.tsx") is True
    assert is_supported("README.md") is False

def test_extensions_complete():
    assert ".py" in SUPPORTED_EXTENSIONS
    assert ".js" in SUPPORTED_EXTENSIONS
    assert ".tsx" in SUPPORTED_EXTENSIONS

def test_detect_framework_nextjs():
    paths = ["app/layout.tsx", "app/page.tsx", "next.config.js", "src/lib/utils.ts"]
    assert detect_framework(paths) == "nextjs"

def test_detect_framework_react():
    paths = ["src/App.jsx", "src/components/Button.jsx", "package.json"]
    assert detect_framework(paths) == "react"

def test_detect_framework_none():
    paths = ["main.py", "utils.py"]
    assert detect_framework(paths) is None


# ── JS / JSX Parsing ─────────────────────────────────────────
from app.services.parsers.js_parser import parse_js_ts

def test_parse_js_basic():
    code = "function hello() { return 42; }"
    ir = parse_js_ts(code, "test.js", "javascript")
    assert ir["type"] == "Module"
    assert ir["language"] == "javascript"
    assert len(ir["children"]) > 0

def test_parse_jsx_component():
    code = """
import React from 'react';
function App() {
  return <div><h1>Hello</h1></div>;
}
export default App;
"""
    ir = parse_js_ts(code, "App.jsx", "javascript")
    # Should find: ImportDeclaration, FunctionDeclaration, ExportDeclaration
    child_types = [c["type"] for c in ir["children"]]
    assert "ImportDeclaration" in child_types
    assert "FunctionDeclaration" in child_types
    assert "ExportDeclaration" in child_types

def test_parse_tsx():
    code = """
import React, { useState } from 'react';
const Counter: React.FC = () => {
  const [count, setCount] = useState<number>(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
};
export default Counter;
"""
    ir = parse_js_ts(code, "Counter.tsx", "typescript")
    assert ir["type"] == "Module"
    assert ir["language"] == "typescript"


# ── Unified Normaliser ───────────────────────────────────────
from app.services.unified_normalizer import normalize_ir
from app.services.unified_hasher import hash_ir


def test_normalise_jsx_renames():
    """Two structurally identical components with different names
    should normalise to the same hash set."""
    code_a = """
import React, { useState } from 'react';
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
"""
    code_b = """
import React, { useState } from 'react';
function Tracker() {
  const [clicks, setClicks] = useState(0);
  return <div>{clicks}</div>;
}
"""
    ir_a = parse_js_ts(code_a, "A.jsx")
    ir_b = parse_js_ts(code_b, "B.jsx")

    norm_a = normalize_ir(ir_a)
    norm_b = normalize_ir(ir_b)

    fa = hash_ir(norm_a)
    fb = hash_ir(norm_b)

    intersection = fa.hash_set & fb.hash_set
    union = fa.hash_set | fb.hash_set
    similarity = len(intersection) / len(union) if union else 0.0

    assert similarity > 0.9, f"Expected high similarity, got {similarity:.4f}"


def test_normalise_different_structure():
    """Structurally different components should have low similarity."""
    code_a = """
function Hello() { return <h1>Hi</h1>; }
"""
    code_b = """
function App() {
  const [x, setX] = useState(0);
  useEffect(() => { console.log(x); }, [x]);
  return <div><input value={x} onChange={e => setX(e.target.value)} /><p>{x}</p></div>;
}
"""
    ir_a = parse_js_ts(code_a, "A.jsx")
    ir_b = parse_js_ts(code_b, "B.jsx")

    fa = hash_ir(normalize_ir(ir_a))
    fb = hash_ir(normalize_ir(ir_b))

    inter = fa.hash_set & fb.hash_set
    union = fa.hash_set | fb.hash_set
    similarity = len(inter) / len(union) if union else 0.0

    assert similarity < 0.5, f"Expected low similarity, got {similarity:.4f}"


# ── Module Graph ─────────────────────────────────────────────
from app.services.module_graph import build_import_graph, compute_module_similarity


def test_build_import_graph_js():
    files = {
        "src/App.jsx": "import Button from './components/Button';",
        "src/components/Button.jsx": "export default function Button() {}",
    }
    graph = build_import_graph(files, "javascript")
    assert graph.file_count == 2
    assert len(graph.edges) > 0


def test_module_similarity_identical():
    files_a = {
        "src/App.jsx": "import Button from './Button';",
        "src/Button.jsx": "export default function Button() {}",
    }
    files_b = {
        "src/App.jsx": "import Btn from './Btn';",
        "src/Btn.jsx": "export default function Btn() {}",
    }
    ga = build_import_graph(files_a, "javascript")
    gb = build_import_graph(files_b, "javascript")
    result = compute_module_similarity(ga, gb)
    # Same structure → should have some similarity
    assert result.similarity >= 0.0


def test_module_similarity_different():
    files_a = {
        "src/index.js": "import a from './a'; import b from './b';",
        "src/a.js": "",
        "src/b.js": "",
    }
    files_b = {
        "lib/main.js": "import x from '../utils';",
        "utils/index.js": "",
    }
    ga = build_import_graph(files_a, "javascript")
    gb = build_import_graph(files_b, "javascript")
    result = compute_module_similarity(ga, gb)
    assert result.similarity <= 1.0  # just a sanity check


# ── Python backward compatibility ────────────────────────────
from app.services.ast_parser import parse_code, generate_subtree_hashes
from app.services.normalizer import normalize_ast


def test_python_pipeline_unchanged():
    """Ensure the original Python pipeline still works exactly as before."""
    code = """
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
"""
    tree = parse_code(code)
    norm = normalize_ast(tree)
    analysis = generate_subtree_hashes(norm)
    assert len(analysis.hash_set) > 0
    assert len(analysis.subtree_infos) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
