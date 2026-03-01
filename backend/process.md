# Code Plagiarism Detection Backend – Process & Architecture

---

## 🏗 Project Structure

```
backend/
├── requirements.txt
└── app/
    ├── __init__.py
    ├── main.py                    # FastAPI entrypoint & app setup
    ├── api/
    │   ├── __init__.py
    │   └── routes/
    │       ├── __init__.py
    │       └── analyze.py         # FastAPI endpoints & orchestrations
    ├── core/
    │   └── __init__.py
    ├── models/
    │   ├── __init__.py
    │   └── schemas.py             # Pydantic models & request schemas
    ├── services/
    │   ├── __init__.py
    │   ├── ast_parser.py          # Source parsing + subtree hashing with line tracking
    │   ├── normalizer.py          # AST normalization (canonical renaming, docstring removal)
    │   ├── similarity.py          # Jaccard similarity + matching region extraction
    │   ├── advanced_similarity.py # CFG and Dataflow similarity analyses
    │   ├── llm_judge.py           # 🆕 Gemini AI Semantic Judge (triggers at ≥ 0.70)
    │   ├── metrics.py             # Structural AST metrics (depth, function count, etc.)
    │   ├── visualization.py       # AST tree visualization in lightweight JSON
    │   ├── analysis_orchestrator.py # Unified analysis pipeline + LLM summary aggregation
    │   ├── graph_builder.py       # Similarity graph, matrix, and cluster generation
    │   └── github_service.py      # GitHub repository fetching logic
    └── utils/
        ├── __init__.py
        ├── types.py               # Shared types (SubtreeInfo, FileAnalysis)
        └── zip_handler.py         # In-memory ZIP extraction
```

---

## 🔄 The Processing Pipeline

```
Upload (.py files or .zip)
    │
    ▼
┌─────────────────────────┐
│  1. zip_handler.py      │  ← Extract .py files from ZIP (if applicable)
│     extract_py_files()  │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  2. ast_parser.py       │  ← Convert source code → AST
│     parse_code()        │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  3. normalizer.py       │  ← Rename vars/funcs, replace constants,
│     normalize_ast()     │     strip docstrings, preserve line numbers
└────────────┬────────────┘
             ▼
┌──────────────────────────────┐
│  4. ast_parser.py            │  ← SHA-256 hash per subtree node,
│     generate_subtree_hashes()│     with start_line / end_line tracking
└────────────┬─────────────────┘
             ▼
┌──────────────────────────────────┐
│  5. Structural Similarity Engine │  ← AST + CFG + DataFlow weighted
│     similarity.py                │     Jaccard similarity
│     advanced_similarity.py       │
└────────────┬─────────────────────┘
             ▼
       Score ≥ 0.70 ?
        ╱         ╲
      YES          NO
       │            │
       ▼            │
┌──────────────────┐│
│  6. llm_judge.py ││  ← Gemini AI Semantic Judge
│     evaluate_pair││     Classifies: STANDARD_ALGORITHM
│                  ││                 TEMPLATE_OR_BOILERPLATE
│                  ││                 LIKELY_COPY
└────────┬─────────┘│
         ▼          ▼
┌──────────────────────────────────┐
│  7. analysis_orchestrator.py     │  ← Unified response assembly
│     Graph + Matrix + Clusters    │     + LLM summary aggregation
└────────────┬─────────────────────┘
             ▼
       API JSON Response
```

---

## � Step-by-Step Details

### Step 1 – Source Parsing
Uses Python's built-in `ast.parse()` to convert source code into an Abstract Syntax Tree.
- Comments, whitespace, and formatting are automatically discarded.
- `SyntaxError` is caught and reported per file without crashing the pipeline.

### Step 2 – AST Normalization
Applies transformations so structurally identical code produces the same tree regardless of:
| Transformation | Before | After |
|---|---|---|
| Variable names | `result`, `answer` | `var_1`, `var_2` |
| Function names | `add_numbers`, `sum_values` | `func_1`, `func_2` |
| Constants | `42`, `"hello"`, `3.14` | `"CONST"` |
| Docstrings | `"""Adds two numbers."""` | *(removed)* |

**Line numbers (`lineno`, `end_lineno`) are preserved** through normalization for downstream region tracking.

### Step 3 – Subtree Hashing with Line Tracking
Every meaningful AST node gets a fingerprint:
```
hash = SHA-256( NodeType | sorted(child_hashes) )
```

Trivial nodes (bare `Name`, operators like `Add`, `Store`) are hashed but **not tracked** as standalone regions — they only contribute to their parent's hash.

Each tracked hash is stored as a `SubtreeInfo`:
```json
{
    "hash": "abc123...",
    "start_line": 5,
    "end_line": 12
}
```

### Step 4 – Structural Similarity (AST + CFG + DataFlow)
For each file pair, three layers are computed:

| Layer | What it Captures | Weight |
|-------|-----------------|--------|
| AST Jaccard | Subtree hash overlap | 40% |
| CFG Jaccard | Control flow graph edges | 30% |
| DataFlow Jaccard | Data dependency graph edges | 30% |

$$Final\_Score = 0.4 \times AST + 0.3 \times CFG + 0.3 \times DataFlow$$

For suspicious pairs (similarity ≥ 0.5), the system identifies **which subtree hashes are shared** and maps them back to line ranges in both files:
```json
{
    "file1_lines": [5, 12],
    "file2_lines": [8, 15]
}
```

This enables a frontend to **highlight the exact copied regions**.

### Step 5 – Gemini AI Semantic Judge (Score ≥ 0.70)

When the structural similarity score **≥ 0.70**, the system invokes the **Gemini AI LLM** to semantically evaluate the code pair. This dramatically reduces false positives.

**What it does:**
- Sends both source codes + similarity breakdown to Gemini
- Receives a structured JSON classification
- Produces a refined verdict combining structural + semantic analysis

**Classifications:**
| Classification | Meaning |
|---|---|
| `STANDARD_ALGORITHM` | Both implement a common known algorithm (e.g., Sieve, BFS/DFS) |
| `TEMPLATE_OR_BOILERPLATE` | Both follow a common public template or coding pattern |
| `LIKELY_COPY` | Suspicious: uncommon structure, identical creative choices |

**Risk Levels (refined verdict):**
| Risk Level | Trigger |
|---|---|
| `NONE` | Standard algorithm — expected similarity |
| `LOW` | Template/boilerplate code |
| `MEDIUM` | LIKELY_COPY with score 0.70–0.85 |
| `HIGH` | LIKELY_COPY with score 0.85–0.95 |
| `CRITICAL` | LIKELY_COPY with score ≥ 0.95 |

**Key design principle:** When uncertain, the prompt instructs Gemini to prefer `STANDARD_ALGORITHM` — conservative by design.

---

## 🚀 API Endpoints

### `GET /`
Health check. Returns service status and available endpoints.

### `POST /analyze`
Upload multiple `.py` files as multipart form data.
```bash
curl -X POST http://127.0.0.1:8000/analyze \
  -F "files=@student_a.py" \
  -F "files=@student_b.py" \
  -F "files=@student_c.py"
```

### `POST /analyze-pair`
Upload exactly two files for a quick 1-to-1 comparison.
```bash
curl -X POST http://127.0.0.1:8000/analyze-pair \
  -F "file1=@a.py" \
  -F "file2=@b.py"
```

### `POST /compare-zips`
Upload two `.zip` archives (one per user) to compare files cross-ZIP.
```bash
curl -X POST http://127.0.0.1:8000/compare-zips \
  -F "zip1=@user1_submission.zip" \
  -F "zip2=@user2_submission.zip"
```

### `POST /compare-github-repos`
Accept two GitHub repository URLs, fetch all Python files, and perform cross-repo structural similarity comparison.

### `POST /visualize-ast`
Upload a single `.py` file to get its normalized AST as a lightweight JSON tree structure, ideal for frontend D3 visualizations.

### `POST /structure-summary`
Upload a single `.py` file to receive its overall structural metrics: `ast_depth`, `function_count`, `loop_count`, `if_count`, `basic_cyclomatic_complexity`, and total/unique subtree counts.

### `GET /similarity-graph`
Returns a graph structure (nodes and edges) of files parsed in the latest `/analyze` or `/compare-zips` request with similarity score `>= 0.5`.

### `GET /similarity-matrix`
Returns a 2D matrix representing pairwise similarities between all files from the latest analysis, suitable for rendering a heatmap.

### `GET /clusters`
Finds strongly connected components of files (similarity `>= 0.75`) to detect highly suspicious plagiarism rings.

---

## 📤 Response Format

```json
{
  "analysis_id": "uuid-v4",
  "summary": {
    "total_files": 4,
    "suspicious_pairs_count": 2,
    "highest_similarity": 0.87,
    "cluster_count": 1
  },
  "similarity": {
    "pairs": [
      {
        "file1": "studentA.py",
        "file2": "studentB.py",
        "similarity_score": 0.87,
        "matching_regions": [
          {
            "file1_lines": [1, 3],
            "file2_lines": [1, 3],
            "file1_code": [{"line_number": 1, "code": "def function():"}],
            "file2_code": [{"line_number": 1, "code": "def function():"}]
          }
        ],
        "llm_verdict": {
          "classification": "LIKELY_COPY",
          "confidence": "HIGH",
          "algorithm_detected": "NONE",
          "reasoning": "Both files share uncommon structural patterns..."
        },
        "refined_verdict": {
          "refined_classification": "LIKELY_COPY",
          "refined_risk_level": "HIGH",
          "original_structural_score": 0.87,
          "llm_confidence": "HIGH",
          "algorithm_detected": "NONE",
          "reasoning": "Both files share uncommon structural patterns...",
          "recommendation": "High structural similarity confirmed by LLM as likely copied. Recommend manual review."
        }
      }
    ]
  },
  "llm_summary": {
    "pairs_evaluated_by_llm": 2,
    "classification_breakdown": {"LIKELY_COPY": 1, "STANDARD_ALGORITHM": 1},
    "risk_level_breakdown": {"HIGH": 1, "NONE": 1},
    "likely_copy_count": 1,
    "standard_algorithm_count": 1,
    "template_count": 0
  },
  "metadata": {
    "analysis_type": "multi_file",
    "timestamp": "2026-03-01T00:00:00Z",
    "llm_enabled": true
  }
}
```

> **Note:** `llm_verdict` and `refined_verdict` fields appear only on pairs with `similarity_score >= 0.70` and when `GEMINI_API_KEY` is configured. Pairs below 0.70 still appear (if above the 0.5 threshold) but without LLM evaluation.

---

## 🛠 Setup & Run

```bash
# From the backend directory
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload
```

Interactive API docs: **http://127.0.0.1:8000/docs**
