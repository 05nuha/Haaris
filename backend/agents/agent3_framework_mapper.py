"""
Haaris (حارس) — Agent 3: Framework Mapper

Maps the findings from Agents 1 and 2 to relevant compliance frameworks:
- UAE PDPL (Federal Decree-Law No. 45 of 2021) — article-level mapping
- UAE National AI Security Policy — affected mandates
- Digital Dubai Ethical AI Guidelines — pillar mapping
  (Accountability, Transparency, Fairness, Explainability)
- OWASP LLM Top 10 — LLM01–LLM10 categories
- MITRE ATLAS — adversarial ML techniques

Uses Llama 3.3 70B via the Groq API (free tier) — cross-framework
mapping benefits from the larger model, and Groq serves it in seconds.
"""

from __future__ import annotations

import json
import logging
import os
import re

from groq import AsyncGroq, GroqError

from backend.models import (
    AgentStatus,
    FrameworkMapping,
    FrameworkResults,
    InjectionResults,
    PIIResults,
    Severity,
)

logger = logging.getLogger("haaris.agent3")

MAPPER_MODEL = os.getenv("MAPPER_MODEL", "llama-3.3-70b-versatile")

_SYSTEM_PROMPT = """You are a UAE AI-compliance analyst inside an enterprise LLM \
guardrail. You receive structured findings from two upstream detectors (a UAE PII \
detector and a prompt-injection classifier). Map each finding to the relevant \
compliance frameworks. Be precise and cite specific references:

- UAE PDPL (Federal Decree-Law No. 45 of 2021): cite article numbers where a \
processing/consent/cross-border-transfer obligation is implicated.
- UAE National AI Security Policy (UAE Cybersecurity Council): cite the affected \
mandate (e.g. AI risk management, human-in-the-loop, transparency/explainability).
- Digital Dubai Ethical AI Guidelines: cite the pillar — Accountability, \
Transparency, Fairness, or Explainability.
- OWASP LLM Top 10: cite the category code (LLM01 Prompt Injection, LLM02 Insecure \
Output Handling, LLM03 Training Data Poisoning, LLM06 Sensitive Information \
Disclosure, LLM09 Overreliance, etc.).
- MITRE ATLAS: cite the technique ID (e.g. AML.T0051 LLM Prompt Injection, \
AML.T0054 LLM Jailbreak, AML.T0048 Societal Harm).

Only produce mappings actually supported by the findings. If the findings are clean, \
return an empty mappings list.

Respond ONLY with a JSON object (no prose, no markdown fences):
{
  "mappings": [
    {
      "framework": "<framework name>",
      "reference": "<article / category / technique / pillar>",
      "violation": "<plain-language description>",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "remediation": "<concrete remediation step>"
    }
  ],
  "pdpl_violation": true | false,
  "summary": "<two or three sentence overall assessment>"
}"""


def _build_user_message(pii: PIIResults, injection: InjectionResults) -> str:
    payload = {
        "pii_detector_findings": pii.model_dump(mode="json"),
        "injection_classifier_findings": injection.model_dump(mode="json"),
    }
    return (
        "Map the following upstream detector findings to compliance frameworks:\n\n"
        + json.dumps(payload, indent=2, ensure_ascii=False)
    )


def _parse(raw: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    if not cleaned.startswith("{"):
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            cleaned = match.group(0)
    return json.loads(cleaned)


def _highest(mappings: list[FrameworkMapping]) -> Severity:
    order = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW]
    present = {m.severity for m in mappings}
    for level in order:
        if level in present:
            return level
    return Severity.NONE


async def map_frameworks(
    pii: PIIResults, injection: InjectionResults
) -> FrameworkResults:
    """Map upstream findings to UAE and international compliance frameworks."""
    model_label = f"groq/{MAPPER_MODEL}"

    # Fast path: both detectors clean and healthy — no LLM call needed.
    if (
        pii.status == AgentStatus.COMPLETE
        and injection.status == AgentStatus.COMPLETE
        and not pii.findings
        and not injection.injection_detected
    ):
        return FrameworkResults(
            model=model_label,
            status=AgentStatus.COMPLETE,
            mappings=[],
            pdpl_violation=False,
            highest_severity=Severity.NONE,
            summary="No findings from upstream detectors — no framework violations to map.",
        )

    try:
        client = AsyncGroq()  # reads GROQ_API_KEY from environment
        completion = await client.chat.completions.create(
            model=MAPPER_MODEL,
            temperature=0.0,
            max_tokens=4096,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_message(pii, injection)},
            ],
        )
        data = _parse(completion.choices[0].message.content)

        mappings: list[FrameworkMapping] = []
        for item in data.get("mappings", []):
            if not isinstance(item, dict):
                continue
            try:
                severity = Severity(item.get("severity", "Medium"))
            except ValueError:
                severity = Severity.MEDIUM
            mappings.append(
                FrameworkMapping(
                    framework=str(item.get("framework", "Unknown")),
                    reference=str(item.get("reference", "")),
                    violation=str(item.get("violation", "")),
                    severity=severity,
                    remediation=str(item.get("remediation", "")),
                )
            )

        return FrameworkResults(
            model=model_label,
            status=AgentStatus.COMPLETE,
            mappings=mappings,
            pdpl_violation=bool(data.get("pdpl_violation", False)),
            highest_severity=_highest(mappings),
            summary=str(data.get("summary", "")),
        )
    except json.JSONDecodeError as exc:
        logger.error("Agent 3: mapper returned non-JSON output: %s", exc)
        return FrameworkResults(
            model=model_label,
            status=AgentStatus.ERROR,
            summary="Framework mapping output could not be parsed.",
            error=f"JSON parse error: {exc}",
        )
    except GroqError as exc:
        logger.error("Agent 3: Groq API error (is GROQ_API_KEY set?): %s", exc)
        return FrameworkResults(
            model=model_label,
            status=AgentStatus.ERROR,
            summary="Groq API error during framework mapping.",
            error=str(exc),
        )
    except Exception as exc:
        logger.error("Agent 3 failed: %s", exc)
        return FrameworkResults(
            model=model_label,
            status=AgentStatus.ERROR,
            summary="Unexpected error during framework mapping.",
            error=str(exc),
        )
