
import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ── Lazy-loaded Gemini SDK ───────────────────────────────────────────
_genai = None
_model = None


def _get_llm_threshold() -> float:
    """Read LLM threshold from env-var, defaulting to 0.70."""
    try:
        return float(os.environ.get("LLM_THRESHOLD", 0.70))
    except (TypeError, ValueError):
        return 0.70


# ═══════════════════════════════════════════════════════════════════════
#  Structured response schema (enforced at model decode layer)
# ═══════════════════════════════════════════════════════════════════════

def _build_response_schema():
    """
    Build the Gemini response schema using proto types.

    This tells the model exactly which fields to produce and their types.
    Combined with `response_mime_type="application/json"`, Gemini is
    *forced* to emit valid JSON conforming to this schema — no prompt
    trick needed.
    """
    from google.generativeai.protos import Schema, Type

    return Schema(
        type=Type.OBJECT,
        properties={
            "classification": Schema(
                type=Type.STRING,
                description=(
                    "One of: STANDARD_ALGORITHM, TEMPLATE_OR_BOILERPLATE, LIKELY_COPY"
                ),
            ),
            "confidence": Schema(
                type=Type.STRING,
                description="One of: LOW, MEDIUM, HIGH",
            ),
            "algorithm_detected": Schema(
                type=Type.STRING,
                description="Name of algorithm if identifiable, otherwise NONE",
            ),
            "ai_adjusted_similarity_score": Schema(
                type=Type.NUMBER,
                description=(
                    "AI-adjusted final similarity score between 0.0 and 1.0. "
                    "Must not differ from structural score by more than 0.25."
                ),
            ),
            "adjustment_explanation": Schema(
                type=Type.STRING,
                description="Brief explanation of why the score was adjusted or kept similar.",
            ),
            "reasoning": Schema(
                type=Type.STRING,
                description="Concise explanation (3-5 sentences).",
            ),
        },
        required=[
            "classification",
            "confidence",
            "algorithm_detected",
            "ai_adjusted_similarity_score",
            "adjustment_explanation",
            "reasoning",
        ],
    )


# ═══════════════════════════════════════════════════════════════════════
#  Model initialisation (lazy singleton)
# ═══════════════════════════════════════════════════════════════════════

def _get_model():
    """
    Initialise the Gemini GenerativeModel on first use.

    Key design decisions
    --------------------
    • `response_mime_type = "application/json"` — forces the model to
      emit *only* valid JSON (no markdown fences, no preamble text).
    • `response_schema` — declares the exact shape the JSON must have.
    • `temperature = 0.0` — maximally deterministic output.
    • Lazy init — avoids import-time side-effects; the model is created
      on the first `evaluate_pair()` call.

    Returns None (with a warning) if the API key is missing.
    """
    global _genai, _model

    if _model is not None:
        return _model

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.warning(
            "GEMINI_API_KEY is not set — LLM semantic judge is disabled. "
            "Set the key in your .env file to enable it."
        )
        return None

    try:
        import google.generativeai as genai_module

        _genai = genai_module
        _genai.configure(api_key=api_key)

        response_schema = _build_response_schema()

        _model = _genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            generation_config={
                "temperature": 0.0,
                "top_p": 0.85,
                "max_output_tokens": 1024,
                "response_mime_type": "application/json",
                "response_schema": response_schema,
            },
        )
        logger.info(
            "Gemini LLM judge initialised (model: gemini-2.5-flash, "
            "structured JSON output enabled)"
        )
        return _model
    except Exception as exc:
        logger.error("Failed to initialise Gemini model: %s", exc)
        return None


# ═══════════════════════════════════════════════════════════════════════
#  Prompt template (no JSON format instructions — schema handles it)
# ═══════════════════════════════════════════════════════════════════════

_PROMPT_TEMPLATE = """\
You are an expert academic code plagiarism analyst.

Two Python programs have a STRUCTURAL similarity score of: {similarity_score}

Breakdown:
- AST similarity: {ast_score}
- Control Flow Graph similarity: {cfg_score}
- Data Dependency Graph similarity: {dfg_score}

IMPORTANT:
Structural similarity alone does NOT confirm plagiarism.
Many students independently implement common algorithms
(e.g., Sieve of Eratosthenes, binary exponentiation, greedy sorting,
DFS/BFS, sliding window, bit manipulation tricks).

Your job:

1) Classify the relationship as one of:
   - STANDARD_ALGORITHM: both implement a common known algorithm pattern.
   - TEMPLATE_OR_BOILERPLATE: both follow a common public template.
   - LIKELY_COPY: suspicious uncommon structure, identical creative choices.

2) Produce an AI-adjusted final similarity score (0.0 to 1.0):
   - If STANDARD_ALGORITHM → reduce moderately.
   - If TEMPLATE_OR_BOILERPLATE → reduce slightly.
   - If LIKELY_COPY → keep same or increase slightly.
   - Must not differ from structural score by more than 0.25.

3) Analyse: algorithmic intent, unusual design choices, order of operations,
   custom logic, helper function decomposition, unique edge-case handling,
   identical uncommon variable transformations, identical control-flow
   structuring beyond standard patterns.

Be conservative. When uncertain, prefer STANDARD_ALGORITHM over LIKELY_COPY.

────────────────────────
CODE 1:
{code_1}

────────────────────────
CODE 2:
{code_2}
"""


# ═══════════════════════════════════════════════════════════════════════
#  Result types
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class LLMVerdict:
    """Parsed, validated verdict from the Gemini semantic judge."""
    classification: str          # STANDARD_ALGORITHM | TEMPLATE_OR_BOILERPLATE | LIKELY_COPY
    confidence: str              # LOW | MEDIUM | HIGH
    algorithm_detected: str      # algorithm name or "NONE"
    reasoning: str               # 3-5 sentence explanation
    ai_adjusted_score: Optional[float] = None  # AI-adjusted similarity score
    adjustment_explanation: str = ""  # why the score was adjusted
    raw_response: str = ""       # original model text (for debugging)
    error: Optional[str] = None  # set if parsing / validation failed


_VALID_CLASSIFICATIONS = frozenset({
    "STANDARD_ALGORITHM",
    "TEMPLATE_OR_BOILERPLATE",
    "LIKELY_COPY",
})

_VALID_CONFIDENCES = frozenset({"LOW", "MEDIUM", "HIGH"})


def _parse_verdict(raw_text: str) -> LLMVerdict:
    """
    Parse the Gemini response into a validated LLMVerdict.

    With structured JSON output mode, `raw_text` should already be valid
    JSON.  The multi-layer fallback (code-fence stripping, validation)
    is kept as a safety net for edge cases.
    """
    logger.debug("Raw Gemini response: %s", raw_text)

    cleaned = raw_text.strip()

    # Safety net: strip markdown code fences if model somehow includes them
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]  # drop opening fence
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error(
            "JSON parse failed despite structured output mode. "
            "Raw response: %r | Error: %s",
            raw_text[:500], exc,
        )
        return LLMVerdict(
            classification="UNKNOWN",
            confidence="LOW",
            algorithm_detected="NONE",
            reasoning="Failed to parse LLM response as JSON.",
            raw_response=raw_text,
            error=f"JSON parse error: {exc}",
        )

    # ── Extract and validate fields ──────────────────────────────
    classification = str(data.get("classification", "UNKNOWN")).upper().strip()
    confidence = str(data.get("confidence", "LOW")).upper().strip()
    algorithm_detected = str(data.get("algorithm_detected", "NONE")).strip()
    reasoning = str(data.get("reasoning", "")).strip()
    adjustment_explanation = str(data.get("adjustment_explanation", "")).strip()

    # Parse AI-adjusted score (clamp to [0.0, 1.0])
    ai_adjusted_score: Optional[float] = None
    raw_adj = data.get("ai_adjusted_similarity_score")
    if raw_adj is not None:
        try:
            ai_adjusted_score = max(0.0, min(1.0, float(raw_adj)))
        except (TypeError, ValueError):
            logger.warning("Invalid ai_adjusted_similarity_score: %r", raw_adj)

    # Validate enum fields
    if classification not in _VALID_CLASSIFICATIONS:
        logger.warning("Unknown classification: %r → defaulting to UNKNOWN", classification)
        classification = "UNKNOWN"

    if confidence not in _VALID_CONFIDENCES:
        logger.warning("Unknown confidence: %r → defaulting to LOW", confidence)
        confidence = "LOW"

    return LLMVerdict(
        classification=classification,
        confidence=confidence,
        algorithm_detected=algorithm_detected,
        reasoning=reasoning,
        ai_adjusted_score=ai_adjusted_score,
        adjustment_explanation=adjustment_explanation,
        raw_response=raw_text,
    )


# ═══════════════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class SimilarityScores:
    """Numeric breakdown passed to the LLM for richer context."""
    final_score: float
    ast_score: float = 0.0
    cfg_score: float = 0.0
    dfg_score: float = 0.0


def should_invoke_llm(similarity_score: float) -> bool:
    """Return True if the similarity is high enough to warrant LLM review."""
    return similarity_score >= _get_llm_threshold()


def evaluate_pair(
    code_a: str,
    code_b: str,
    scores: SimilarityScores,
) -> Optional[LLMVerdict]:
    """
    Send a pair of source codes to the Gemini semantic judge.

    Returns an LLMVerdict on success, or None if the LLM is unavailable.
    Handles all exceptions internally — this function never raises.

    Parameters
    ----------
    code_a : str
        Full source code of the first file.
    code_b : str
        Full source code of the second file.
    scores : SimilarityScores
        Numeric similarity breakdown (final, AST, CFG, DFG).
    """
    model = _get_model()
    if model is None:
        return None

    prompt = _PROMPT_TEMPLATE.format(
        similarity_score=f"{scores.final_score:.4f}",
        ast_score=f"{scores.ast_score:.4f}",
        cfg_score=f"{scores.cfg_score:.4f}",
        dfg_score=f"{scores.dfg_score:.4f}",
        code_1=code_a,
        code_2=code_b,
    )

    logger.debug(
        "Invoking Gemini semantic judge (structural_score=%.4f)",
        scores.final_score,
    )

    try:
        response = model.generate_content(prompt)

        # Guard: check for blocked / empty responses
        if not response.candidates:
            logger.warning("Gemini returned no candidates (possibly blocked)")
            return LLMVerdict(
                classification="UNKNOWN",
                confidence="LOW",
                algorithm_detected="NONE",
                reasoning="LLM returned no response candidates.",
                raw_response=str(response),
                error="No candidates in response",
            )

        raw_text = response.text
        logger.info(
            "Gemini responded (%.0f chars, structural=%.4f)",
            len(raw_text), scores.final_score,
        )

        return _parse_verdict(raw_text)

    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc, exc_info=True)
        return LLMVerdict(
            classification="UNKNOWN",
            confidence="LOW",
            algorithm_detected="NONE",
            reasoning="LLM evaluation failed due to an API error.",
            raw_response="",
            error=str(exc),
        )


def verdict_to_dict(verdict: LLMVerdict) -> Dict[str, Any]:
    """Serialise an LLMVerdict into a JSON-safe dictionary."""
    d: Dict[str, Any] = {
        "classification": verdict.classification,
        "confidence": verdict.confidence,
        "algorithm_detected": verdict.algorithm_detected,
        "reasoning": verdict.reasoning,
    }
    if verdict.ai_adjusted_score is not None:
        d["ai_adjusted_similarity_score"] = round(verdict.ai_adjusted_score, 4)
    if verdict.adjustment_explanation:
        d["adjustment_explanation"] = verdict.adjustment_explanation
    if verdict.error:
        d["error"] = verdict.error
    return d


def compute_refined_verdict(
    original_score: float,
    verdict: LLMVerdict,
) -> Dict[str, Any]:
    """
    Produce a refined verdict that combines the structural score with
    the LLM semantic classification.

    Returns a dict with:
        - refined_classification: final label
        - refined_risk_level: NONE | LOW | MEDIUM | HIGH | CRITICAL
        - original_score: the structural score
        - ai_adjusted_score: the LLM-adjusted score (if available)
        - llm_classification: raw LLM label
        - recommendation: human-readable summary
    """
    classification = verdict.classification

    # ── Risk-level mapping ─────────────────────────────────────────
    if classification == "LIKELY_COPY":
        if original_score >= 0.95:
            risk = "CRITICAL"
        elif original_score >= 0.85:
            risk = "HIGH"
        else:
            risk = "MEDIUM"
    elif classification == "TEMPLATE_OR_BOILERPLATE":
        risk = "LOW"
    elif classification == "STANDARD_ALGORITHM":
        risk = "NONE"
    else:
        risk = "LOW"

    # ── Human-readable recommendation ──────────────────────────────
    _recommendations = {
        "CRITICAL": (
            "Very high structural AND semantic similarity — strong indicator "
            "of direct code copying. Manual review highly recommended."
        ),
        "HIGH": (
            "High structural similarity confirmed by LLM as likely copied. "
            "Recommend manual review."
        ),
        "MEDIUM": (
            "Moderate structural similarity with suspicious semantic patterns. "
            "Consider reviewing the flagged regions."
        ),
        "LOW": (
            "Structural similarity is present but likely due to common "
            "templates or boilerplate code. Low plagiarism risk."
        ),
        "NONE": (
            "Both files implement a standard algorithm. Similarity is "
            "expected and does not indicate plagiarism."
        ),
    }

    result: Dict[str, Any] = {
        "refined_classification": classification,
        "refined_risk_level": risk,
        "original_structural_score": round(original_score, 4),
        "llm_classification": classification,
        "llm_confidence": verdict.confidence,
        "algorithm_detected": verdict.algorithm_detected,
        "reasoning": verdict.reasoning,
        "recommendation": _recommendations.get(risk, "Review manually."),
    }

    # Include AI-adjusted score if model produced one
    if verdict.ai_adjusted_score is not None:
        result["ai_adjusted_similarity_score"] = round(verdict.ai_adjusted_score, 4)

    return result
