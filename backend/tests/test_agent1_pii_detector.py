"""Tests for Agent 1 — UAE PII detection and the redact() helper.

These are the guardrail's core PII controls: everything here is local,
deterministic regex, so the tests need no network, no Groq key, no Mongo.

Run with:  python -m pytest backend/tests/ -v
"""

from __future__ import annotations

import asyncio

import pytest

from backend.agents.agent1_pii_detector import detect_pii, redact
from backend.models import AnalysisInput, PIIType, Severity


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

def _scan(prompt: str, response: str = "clean response text"):
    return asyncio.run(detect_pii(AnalysisInput(prompt=prompt, response=response)))


@pytest.mark.parametrize(
    "text,expected_type,expected_severity",
    [
        ("My Emirates ID is 784-1990-1234567-1", PIIType.EMIRATES_ID, Severity.CRITICAL),
        ("ID 784 1990 1234567 1 attached", PIIType.EMIRATES_ID, Severity.CRITICAL),
        ("Call me on +971 50 123 4567", PIIType.UAE_PHONE, Severity.MEDIUM),
        ("Call me on 0501234567", PIIType.UAE_PHONE, Severity.MEDIUM),
        ("Passport N1234567 expires soon", PIIType.UAE_PASSPORT, Severity.CRITICAL),
        ("License CN-1234567 is registered", PIIType.TRADE_LICENSE, Severity.HIGH),
        ("trade license no. 123456 in Dubai", PIIType.TRADE_LICENSE, Severity.HIGH),
        ("Email me at fatima.k@example.ae", PIIType.EMAIL, Severity.MEDIUM),
        ("Transfer to AE070331234567890123456", PIIType.IBAN, Severity.CRITICAL),
        ("IBAN AE07 0331 2345 6789 0123 456 please", PIIType.IBAN, Severity.CRITICAL),
    ],
)
def test_detects_identifier(text, expected_type, expected_severity):
    result = _scan(text)
    types = {f.pii_type for f in result.findings}
    assert expected_type in types
    finding = next(f for f in result.findings if f.pii_type == expected_type)
    assert finding.severity == expected_severity
    assert finding.location == "prompt"


def test_clean_text_has_no_findings():
    result = _scan("Summarize our Q3 marketing plan for the Dubai region.")
    assert result.findings == []
    assert result.highest_severity == Severity.NONE


def test_matched_text_is_masked_in_findings():
    result = _scan("My Emirates ID is 784-1990-1234567-1")
    finding = result.findings[0]
    assert "784-1990-1234567-1" != finding.matched_text
    assert "*" in finding.matched_text


def test_scans_response_field_too():
    result = _scan("clean prompt", "The customer's number is 0501234567")
    assert any(f.location == "response" for f in result.findings)


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw,placeholder",
    [
        ("784-1990-1234567-1", "[EMIRATES_ID_REDACTED]"),
        ("+971 50 123 4567", "[UAE_PHONE_REDACTED]"),
        ("N1234567", "[PASSPORT_LIKE_ID_REDACTED]"),
        ("CN-1234567", "[TRADE_LICENSE_REDACTED]"),
        ("fatima.k@example.ae", "[EMAIL_REDACTED]"),
        ("AE070331234567890123456", "[IBAN_REDACTED]"),
    ],
)
def test_redact_replaces_with_typed_placeholder(raw, placeholder):
    redacted = redact(f"sensitive value: {raw} end")
    assert raw not in redacted
    assert placeholder in redacted


def test_redact_removes_every_identifier_from_mixed_text():
    raw = (
        "Customer Fatima, Emirates ID 784-1990-1234567-1, phone +971501234567, "
        "email fatima.k@example.ae, passport N1234567, IBAN AE070331234567890123456, "
        "trade license CN-1234567."
    )
    redacted = redact(raw)
    for secret in (
        "784-1990-1234567-1",
        "+971501234567",
        "fatima.k@example.ae",
        "N1234567",
        "AE070331234567890123456",
        "CN-1234567",
    ):
        assert secret not in redacted, f"{secret} leaked through redact()"
    assert "Customer Fatima" in redacted  # non-matched text is preserved


def test_redact_is_idempotent():
    raw = "ID 784-1990-1234567-1 and email a@b.ae"
    once = redact(raw)
    assert redact(once) == once


def test_redact_leaves_clean_text_untouched():
    text = "Summarize our Q3 marketing plan for the Dubai region."
    assert redact(text) == text


def test_redact_handles_iban_before_passport_fragments():
    # A spaced IBAN must become one IBAN placeholder, not passport fragments.
    redacted = redact("AE07 0331 2345 6789 0123 456")
    assert "[IBAN_REDACTED]" in redacted
    assert "[PASSPORT_LIKE_ID_REDACTED]" not in redacted
