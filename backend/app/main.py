import os
from dotenv import load_dotenv

# Load .env before anything reads env vars
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.analyze import router as analyze_router

app = FastAPI(
    title="Code Plagiarism Detector",
    description=(
        "Upload multiple `.py` files or a ZIP archive and receive "
        "pairwise similarity scores with matched line regions."
    ),
    version="1.0.0",
)

# Allow any origin for hackathon demo convenience
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)

@app.get("/", tags=["Health"])
async def health_check():
    """Simple health-check / landing endpoint."""
    return {
        "status": "ok",
        "service": "Code Plagiarism Detector",
        "version": "1.2.0",
        "llm_layer": "Gemini AI Semantic Judge (triggers at similarity >= 0.70)",
        "endpoints": [
            "POST /analyze              – upload multiple .py files -> unified result",
            "POST /analyze-pair         – upload exactly two .py files -> unified result",
            "POST /analyze-advanced     – upload two .py files -> AST + CFG + DataFlow + LLM verdict",
            "POST /compare-zips         – upload two ZIPs (one per user) -> unified result",
            "POST /compare-github-repos – compare two GitHub repo URLs -> unified result",
            "POST /analyze-google-sheet – batch analysis from a public Google Sheet",
            "POST /visualize-ast        – upload .py -> AST tree JSON",
            "POST /structure-summary    – upload .py -> metrics + subtree counts",
            "GET  /similarity-graph     – graph from a specific analysis_id",
            "GET  /similarity-matrix    – matrix from a specific analysis_id",
            "GET  /clusters             – clusters from a specific analysis_id",
        ],
    }

