"""
Haaris (حارس) — Agent 1: UAE PII Detector

UAE Personal Data Protection Law (PDPL, Federal Decree-Law No. 45 of 2021)
compliance checker. Detects locally-regulated personal identifiers using
deterministic regex pattern matching only — no LLM calls of any kind.

Regex-only design: pattern matching is deterministic, instant, and cannot
hallucinate or return malformed output. And since nothing is sent to any
model, the analyzed text trivially never leaves the process — the security
layer itself cannot introduce new PDPL violations.

Detects:
- Emirates ID          784-YYYY-NNNNNNN-C
- UAE phone numbers    +971 5X XXX XXXX (and 00971 / 05X local variants)
- UAE passport numbers letter + 7-8 digits
- Trade license numbers CN/DED/TL prefixed, or "trade license no. NNNN"
- Email addresses      standard local@domain.tld form
- UAE IBAN             AE + 21 digits (space/dash tolerant)

Also exposes redact(), which replaces every match with a typed placeholder
(e.g. [EMIRATES_ID_REDACTED]) so the orchestrator can strip PII from the
prompt/response before any text is sent to a cloud LLM.
"""

from __future__ import annotations

import logging
import re

from backend.models import (
    AgentStatus,
    AnalysisInput,
    PIIFinding,
    PIIResults,
    PIIType,
    Severity,
)

logger = logging.getLogger("haaris.agent1")

MODEL_LABEL = "regex (deterministic)"

# ---------------------------------------------------------------------------
# Deterministic UAE PII patterns
# Each entry: (PIIType, compiled regex, severity)
# ---------------------------------------------------------------------------

_PATTERNS: list[tuple[PIIType, re.Pattern[str], Severity]] = [
    # Emirates ID: 784-YYYY-NNNNNNN-C (separators optional / space-tolerant)
    (
        PIIType.EMIRATES_ID,
        re.compile(r"\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b"),
        Severity.CRITICAL,
    ),
    # UAE IBAN: AE + 2 check digits + 19-digit BBAN (space/dash tolerant).
    # Listed before the passport pattern so redaction consumes the full IBAN
    # rather than leaving fragments a later pattern could half-match.
    (
        PIIType.IBAN,
        re.compile(r"\bAE\d{2}(?:[\s-]?\d{4}){4}[\s-]?\d{3}\b"),
        Severity.CRITICAL,
    ),
    # Email addresses (standard local@domain.tld). Listed before the phone and
    # passport patterns so redaction removes the whole address, not a digit
    # run inside it.
    (
        PIIType.EMAIL,
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        Severity.MEDIUM,
    ),
    # UAE mobile numbers: +971 5X XXX XXXX, 00971 5X..., and local 05X variants
    (
        PIIType.UAE_PHONE,
        re.compile(r"(?:\+971|00971|0)[\s-]?5[0-9][\s-]?\d{3}[\s-]?\d{4}\b"),
        Severity.MEDIUM,
    ),
    # UAE passport numbers: single letter followed by 7-8 digits
    (
        PIIType.UAE_PASSPORT,
        re.compile(r"\b[A-Z]\d{7,8}\b"),
        Severity.CRITICAL,
    ),
    # Trade license numbers: CN/DED/TL prefixed, or "trade licen[cs]e no. NNNN"
    (
        PIIType.TRADE_LICENSE,
        re.compile(
            r"\b(?:CN|DED|TL)[-\s]?\d{5,8}\b|"
            r"(?i:trade\s+licen[cs]e)\s*(?:no\.?|number|#)?[:\s-]*\d{4,10}\b"
        ),
        Severity.HIGH,
    ),
]


def _mask(text: str) -> str:
    """Partially mask a match before it goes into logs / MongoDB.

    The audit trail must never itself become a PII store.
    """
    if len(text) <= 4:
        return "*" * len(text)
    visible = max(2, len(text) // 5)
    return text[:visible] + "*" * (len(text) - 2 * visible) + text[-visible:]


# Typed placeholders used by redact(). Every PIIType with a pattern above
# must have an entry here.
_REDACTION_PLACEHOLDERS: dict[PIIType, str] = {
    PIIType.EMIRATES_ID: "[EMIRATES_ID_REDACTED]",
    PIIType.IBAN: "[IBAN_REDACTED]",
    PIIType.EMAIL: "[EMAIL_REDACTED]",
    PIIType.UAE_PHONE: "[UAE_PHONE_REDACTED]",
    PIIType.UAE_PASSPORT: "[PASSPORT_LIKE_ID_REDACTED]",
    PIIType.TRADE_LICENSE: "[TRADE_LICENSE_REDACTED]",
}


def redact(text: str) -> str:
    """Replace every detected PII match with a typed placeholder.

    Deterministic and self-contained: it re-runs the same _PATTERNS used for
    detection, so it needs no upstream agent state and cannot fail open if
    Agent 1's scan errored. Patterns are applied in _PATTERNS order — broader
    identifiers (IBAN, email) are listed before the narrower digit-run
    patterns that could otherwise match fragments inside them.
    """
    for pii_type, pattern, _severity in _PATTERNS:
        text = pattern.sub(_REDACTION_PLACEHOLDERS[pii_type], text)
    return text


def _regex_scan(text: str, location: str) -> list[PIIFinding]:
    """Run all deterministic patterns over one text field."""
    findings: list[PIIFinding] = []
    for pii_type, pattern, severity in _PATTERNS:
        for match in pattern.finditer(text):
            findings.append(
                PIIFinding(
                    pii_type=pii_type,
                    matched_text=_mask(match.group(0)),
                    location=location,
                    start=match.start(),
                    end=match.end(),
                    severity=severity,
                    detection_method="regex",
                )
            )
    return findings


def _highest(findings: list[PIIFinding]) -> Severity:
    order = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW]
    present = {f.severity for f in findings}
    for level in order:
        if level in present:
            return level
    return Severity.NONE


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

async def detect_pii(analysis_input: AnalysisInput) -> PIIResults:
    """Scan the prompt/response pair for UAE-regulated PII using regex only.

    Kept async so the orchestrator can gather it alongside Agent 2 without
    special-casing; the work itself is synchronous and effectively instant.
    """
    try:
        findings: list[PIIFinding] = []
        findings += _regex_scan(analysis_input.prompt, "prompt")
        findings += _regex_scan(analysis_input.response, "response")

        highest = _highest(findings)
        if findings:
            counts: dict[str, int] = {}
            for f in findings:
                counts[f.pii_type.value] = counts.get(f.pii_type.value, 0) + 1
            summary = (
                f"Detected {len(findings)} UAE-regulated identifier(s): "
                + ", ".join(f"{v}× {k}" for k, v in counts.items())
                + f". Highest severity: {highest.value}."
            )
        else:
            summary = "No UAE-regulated personal identifiers detected."

        return PIIResults(
            model=MODEL_LABEL,
            status=AgentStatus.COMPLETE,
            findings=findings,
            highest_severity=highest,
            summary=summary,
        )
    except Exception as exc:
        logger.error("Agent 1 failed: %s", exc)
        return PIIResults(
            model=MODEL_LABEL,
            status=AgentStatus.ERROR,
            findings=[],
            highest_severity=Severity.NONE,
            summary="Agent 1 encountered an error — treat this analysis as unverified.",
            error=str(exc),
        )
