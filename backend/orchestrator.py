"""
Haaris (حارس) — Orchestrator

Coordinates the four-agent pipeline:

    Agent 1 (PII, local regex) — runs first, entirely in-process
                 ↓
    redact() strips detected PII from the prompt/response
                 ↓
    Agent 2 (Validator, Groq) — sees only the redacted text
                 ↓
    Agent 3 (Framework Mapper, Groq)
                 ↓
    Agent 4 (Report Generator, Groq + ReportLab)
                 ↓
    Final decision: COMPLIANT / REVIEW / NON-COMPLIANT

Raw prompt/response text never leaves the process: Agent 1 and redact()
are deterministic local regex, and every downstream cloud call receives
only redacted text or structured findings with masked matches.

The orchestrator also computes the audit-trail input hash and persists
the full result to MongoDB.
"""

from __future__ import annotations

import hashlib
import logging
import uuid

from backend.agents.agent1_pii_detector import detect_pii, redact
from backend.agents.agent2_input_validator import validate_input
from backend.agents.agent3_framework_mapper import map_frameworks
from backend.agents.agent4_report_generator import generate_report
from backend.database import db
from backend.models import (
    AgentOutputs,
    AgentStatus,
    AnalysisInput,
    AnalysisResult,
    Decision,
    InjectionResults,
    PIIResults,
    Severity,
)

logger = logging.getLogger("haaris.orchestrator")

# Confidence above which a classified injection is treated as confirmed.
INJECTION_CONFIRMED_THRESHOLD = 0.75
# Confidence above which we at least flag for review.
INJECTION_SUSPICIOUS_THRESHOLD = 0.40


def _input_hash(analysis_input: AnalysisInput) -> str:
    """SHA-256 over prompt+response for the audit trail (raw text is hashed,
    so the audit log can prove *what* was analyzed without storing it)."""
    digest = hashlib.sha256()
    digest.update(analysis_input.prompt.encode("utf-8"))
    digest.update(b"\x00")  # unambiguous separator
    digest.update(analysis_input.response.encode("utf-8"))
    return digest.hexdigest()


def _decide(pii: PIIResults, injection: InjectionResults, pdpl_violation: bool) -> tuple[Decision, str]:
    """Decision logic.

    NON-COMPLIANT if:
      - Agent 1 finds Critical PII (Emirates ID, passport, IBAN)
      - Agent 2 finds a confirmed injection with high confidence
      - Both agents find issues simultaneously

    REVIEW if:
      - Agent 1 finds Medium/High PII (phone numbers, partial identifiers)
      - Agent 2 finds suspicious patterns below the confirmed threshold
      - Agent 3 maps to a PDPL article violation
      - Any agent errored (fail-safe: never silently pass unverified content)

    COMPLIANT otherwise.
    """
    reasons: list[str] = []

    critical_pii = pii.highest_severity == Severity.CRITICAL
    confirmed_injection = (
        injection.injection_detected
        and injection.confidence >= INJECTION_CONFIRMED_THRESHOLD
    )
    any_pii = len(pii.findings) > 0
    any_injection_signal = (
        injection.injection_detected
        or injection.confidence >= INJECTION_SUSPICIOUS_THRESHOLD
    )

    # --- NON-COMPLIANT ---
    if critical_pii:
        reasons.append(
            f"Critical UAE PII detected ({pii.highest_severity.value} severity) — "
            "UAE PDPL exposure."
        )
    if confirmed_injection:
        reasons.append(
            f"Confirmed {injection.injection_type.value} "
            f"(confidence {injection.confidence:.2f})."
        )
    if any_pii and injection.injection_detected and not (critical_pii or confirmed_injection):
        reasons.append(
            "PII exposure and injection indicators found simultaneously."
        )
    if reasons:
        return Decision.NON_COMPLIANT, " ".join(reasons)

    # --- REVIEW ---
    if any_pii:
        reasons.append(
            f"{len(pii.findings)} lower-severity PII finding(s) "
            f"(highest: {pii.highest_severity.value}) require human review."
        )
    if any_injection_signal:
        reasons.append(
            f"Suspicious pattern classified as {injection.injection_type.value} "
            f"below the confirmed-injection threshold (confidence {injection.confidence:.2f})."
        )
    if pdpl_violation:
        reasons.append("Framework mapper identified a UAE PDPL article violation.")
    if pii.status == AgentStatus.ERROR or injection.status == AgentStatus.ERROR:
        reasons.append(
            "One or more detection agents errored — content could not be fully "
            "verified (fail-safe review)."
        )
    if reasons:
        return Decision.REVIEW, " ".join(reasons)

    # --- COMPLIANT ---
    return (
        Decision.COMPLIANT,
        "All agents returned clean results with no UAE PDPL, injection, or "
        "framework findings.",
    )


async def run_analysis(analysis_input: AnalysisInput) -> AnalysisResult:
    """Run the full four-agent pipeline and persist the result."""
    analysis_id = uuid.uuid4().hex
    logger.info("Starting analysis %s", analysis_id)

    # ------------------------------------------------------------------
    # Stage 1: Agent 1 (local regex) runs first — it is effectively
    # instant, and running it before Agent 2 means the text can be
    # redacted before anything crosses the network boundary.
    # ------------------------------------------------------------------
    try:
        pii_result = await detect_pii(analysis_input)
    except BaseException as exc:
        logger.error("Agent 1 raised: %s", exc)
        pii_result = PIIResults(
            model="regex (deterministic)",
            status=AgentStatus.ERROR,
            summary="Agent 1 crashed before returning results.",
            error=str(exc),
        )

    # redact() re-runs the detection patterns itself, so the cloud call is
    # protected even if Agent 1 errored above.
    redacted_input = AnalysisInput(
        prompt=redact(analysis_input.prompt),
        response=redact(analysis_input.response),
    )

    # ------------------------------------------------------------------
    # Stage 2: Agent 2 classifies the redacted pair via Groq. Raw text
    # must never be passed here.
    # ------------------------------------------------------------------
    try:
        injection_result = await validate_input(redacted_input)
    except BaseException as exc:
        logger.error("Agent 2 raised: %s", exc)
        injection_result = InjectionResults(
            model="groq/unavailable",
            status=AgentStatus.ERROR,
            rationale="Agent 2 crashed before returning results.",
            error=str(exc),
        )

    # Agent 2 only saw redacted text, but its free-text fields flow into
    # Agents 3/4, MongoDB, the PDF, and the frontend — scrub them too in
    # case the model echoed something the placeholders reveal patterns in.
    if injection_result.extracted_payload:
        injection_result.extracted_payload = redact(injection_result.extracted_payload)
    if injection_result.rationale:
        injection_result.rationale = redact(injection_result.rationale)

    # ------------------------------------------------------------------
    # Stage 3: Agent 3 maps the combined findings to frameworks.
    # ------------------------------------------------------------------
    framework_result = await map_frameworks(pii_result, injection_result)

    # ------------------------------------------------------------------
    # Stage 4: Decision, then Agent 4 generates the report.
    # ------------------------------------------------------------------
    decision, rationale = _decide(
        pii_result, injection_result, framework_result.pdpl_violation
    )
    report_result = await generate_report(
        pii_result, injection_result, framework_result, decision.value
    )

    report_url = (
        f"/api/report/{report_result.report_id}"
        if report_result.status == AgentStatus.COMPLETE and report_result.pdf_path
        else None
    )

    result = AnalysisResult(
        analysis_id=analysis_id,
        input_hash=_input_hash(analysis_input),
        decision=decision,
        decision_rationale=rationale,
        agents=AgentOutputs(
            pii=pii_result,
            injection=injection_result,
            framework=framework_result,
            report=report_result,
        ),
        report_url=report_url,
    )

    # ------------------------------------------------------------------
    # Persist to the MongoDB audit trail (non-fatal on failure).
    # ------------------------------------------------------------------
    saved = await db.save_analysis(result)
    if not saved:
        logger.warning("Analysis %s completed but was not persisted", analysis_id)

    logger.info("Analysis %s complete — decision: %s", analysis_id, decision.value)
    return result
