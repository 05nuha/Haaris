"""
Haaris (حارس) — Agent 4: Compliance Report Generator

Generates the final compliance deliverables from all upstream agent outputs:
1. A professional PDF report (ReportLab) with UAE flag colors as accents.
2. A JSON payload aligned with the Digital Dubai AI Ethics Self-Assessment
   pillars (Accountability, Transparency, Fairness, Explainability).
3. An executive summary for non-technical stakeholders, severity ranking,
   and remediation recommendations with UAE PDPL references.

Narrative sections are drafted by Llama 3.3 70B via the Groq API (free
tier). ReportLab rendering runs in a worker thread so the pipeline stays
fully async.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from groq import AsyncGroq
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.models import (
    AgentStatus,
    DigitalDubaiAssessment,
    FrameworkResults,
    InjectionResults,
    PIIResults,
    ReportResults,
    Severity,
)

logger = logging.getLogger("haaris.agent4")

REPORT_MODEL = os.getenv("REPORT_MODEL", "llama-3.3-70b-versatile")
REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "./reports"))

# UAE flag colors used as PDF accents
_UAE_RED = colors.HexColor("#EF3340")
_UAE_GREEN = colors.HexColor("#009739")
_UAE_BLACK = colors.HexColor("#141414")
_MUTED = colors.HexColor("#555555")

_SEVERITY_COLORS = {
    Severity.CRITICAL: colors.HexColor("#B00020"),
    Severity.HIGH: colors.HexColor("#D9534F"),
    Severity.MEDIUM: colors.HexColor("#C9852A"),
    Severity.LOW: colors.HexColor("#2E7D32"),
    Severity.NONE: colors.HexColor("#607D8B"),
}

_SYSTEM_PROMPT = """You are a compliance-report writer inside a UAE enterprise LLM \
guardrail. You receive structured findings from three upstream agents (UAE PII \
detection, injection classification, framework mapping) plus the pipeline decision. \
Write the narrative sections of a formal compliance report for a UAE enterprise \
audience.

Respond ONLY with a JSON object (no prose, no markdown fences):
{
  "executive_summary": "<3-5 sentence summary for non-technical stakeholders>",
  "severity_ranking": ["<finding as one sentence, ordered Critical first>", ...],
  "remediation_recommendations": ["<concrete step, referencing UAE PDPL articles or \
deadlines where relevant>", ...],
  "digital_dubai_assessment": {
    "accountability": "<one or two sentences>",
    "transparency": "<one or two sentences>",
    "fairness": "<one or two sentences>",
    "explainability": "<one or two sentences>"
  }
}"""


def _parse(raw: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    if not cleaned.startswith("{"):
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            cleaned = match.group(0)
    return json.loads(cleaned)


async def _draft_narrative(
    pii: PIIResults,
    injection: InjectionResults,
    framework: FrameworkResults,
    decision: str,
) -> dict:
    """Ask Llama 3.3 70B (via Groq) to draft the narrative sections."""
    client = AsyncGroq()  # reads GROQ_API_KEY from environment
    payload = {
        "pipeline_decision": decision,
        "pii_detector": pii.model_dump(mode="json"),
        "injection_classifier": injection.model_dump(mode="json"),
        "framework_mapper": framework.model_dump(mode="json"),
    }
    completion = await client.chat.completions.create(
        model=REPORT_MODEL,
        temperature=0.2,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Draft the report sections for these findings:\n\n"
                + json.dumps(payload, indent=2, ensure_ascii=False),
            },
        ],
    )
    return _parse(completion.choices[0].message.content)


# ---------------------------------------------------------------------------
# PDF rendering (synchronous ReportLab, run via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _render_pdf(
    path: Path,
    report_id: str,
    decision: str,
    narrative: dict,
    pii: PIIResults,
    injection: InjectionResults,
    framework: FrameworkResults,
) -> None:
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "HaarisTitle",
        parent=styles["Title"],
        fontSize=20,
        textColor=_UAE_BLACK,
        alignment=TA_CENTER,
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "HaarisSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=_MUTED,
        alignment=TA_CENTER,
        spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "HaarisH2",
        parent=styles["Heading2"],
        textColor=_UAE_GREEN,
        spaceBefore=14,
        spaceAfter=6,
    )
    body = ParagraphStyle("HaarisBody", parent=styles["Normal"], fontSize=10, leading=14)

    decision_color = {
        "COMPLIANT": _UAE_GREEN,
        "REVIEW": colors.HexColor("#C9852A"),
        "NON-COMPLIANT": _UAE_RED,
    }.get(decision, _MUTED)
    decision_style = ParagraphStyle(
        "HaarisDecision",
        parent=styles["Normal"],
        fontSize=16,
        textColor=decision_color,
        alignment=TA_CENTER,
        spaceBefore=6,
        spaceAfter=6,
    )

    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Haaris Compliance Report {report_id}",
    )

    story: list = []
    story.append(Paragraph("Haaris (حارس) — LLM Compliance Report", title_style))
    story.append(
        Paragraph(
            f"Report ID: {report_id} &nbsp;|&nbsp; Generated: "
            f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            subtitle_style,
        )
    )
    # UAE flag tricolor rule
    for color in (_UAE_GREEN, colors.white, _UAE_BLACK, _UAE_RED):
        story.append(HRFlowable(width="100%", thickness=2, color=color, spaceAfter=0))
    story.append(Spacer(1, 10))

    story.append(Paragraph(f"<b>Decision: {decision}</b>", decision_style))

    story.append(Paragraph("Executive Summary", h2))
    story.append(Paragraph(narrative.get("executive_summary", "N/A"), body))

    # PII findings table
    story.append(Paragraph("Agent 1 — UAE PII Detection", h2))
    story.append(Paragraph(pii.summary or "N/A", body))
    if pii.findings:
        rows = [["Type", "Location", "Match (masked)", "Severity"]]
        for f in pii.findings:
            rows.append([f.pii_type.value, f.location, f.matched_text, f.severity.value])
        table = Table(rows, colWidths=[45 * mm, 22 * mm, 65 * mm, 25 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), _UAE_GREEN),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(Spacer(1, 4))
        story.append(table)

    # Injection classification
    story.append(Paragraph("Agent 2 — Input/Output Validation", h2))
    inj_text = (
        f"Detected: <b>{'Yes' if injection.injection_detected else 'No'}</b> &nbsp;|&nbsp; "
        f"Type: {injection.injection_type.value} &nbsp;|&nbsp; "
        f"Confidence: {injection.confidence:.2f} &nbsp;|&nbsp; "
        f"Severity: {injection.severity.value}<br/>{injection.rationale}"
    )
    story.append(Paragraph(inj_text, body))

    # Framework mappings table
    story.append(Paragraph("Agent 3 — Framework Mapping", h2))
    story.append(Paragraph(framework.summary or "N/A", body))
    if framework.mappings:
        rows = [["Framework", "Reference", "Violation", "Severity"]]
        for m in framework.mappings:
            rows.append(
                [
                    Paragraph(m.framework, body),
                    Paragraph(m.reference, body),
                    Paragraph(m.violation, body),
                    m.severity.value,
                ]
            )
        table = Table(rows, colWidths=[38 * mm, 28 * mm, 70 * mm, 22 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), _UAE_BLACK),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(Spacer(1, 4))
        story.append(table)

    # Severity ranking
    ranking = narrative.get("severity_ranking", [])
    if ranking:
        story.append(Paragraph("Severity Ranking", h2))
        for i, item in enumerate(ranking, 1):
            story.append(Paragraph(f"{i}. {item}", body))

    # Remediation
    recs = narrative.get("remediation_recommendations", [])
    if recs:
        story.append(Paragraph("Remediation Recommendations", h2))
        for i, rec in enumerate(recs, 1):
            story.append(Paragraph(f"{i}. {rec}", body))

    # Digital Dubai assessment
    dd = narrative.get("digital_dubai_assessment", {})
    if dd:
        story.append(Paragraph("Digital Dubai AI Ethics Self-Assessment", h2))
        for pillar in ("accountability", "transparency", "fairness", "explainability"):
            story.append(
                Paragraph(f"<b>{pillar.title()}:</b> {dd.get(pillar, 'N/A')}", body)
            )

    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=1, color=_MUTED))
    story.append(
        Paragraph(
            "Generated by Haaris (حارس) — UAE LLM Compliance Guardrail. "
            "This report is an automated analysis aid and does not constitute legal advice.",
            ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=_MUTED),
        )
    )

    doc.build(story)


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

async def generate_report(
    pii: PIIResults,
    injection: InjectionResults,
    framework: FrameworkResults,
    decision: str,
) -> ReportResults:
    """Generate the compliance report (PDF + structured JSON sections)."""
    report_id = uuid.uuid4().hex[:12]
    try:
        # 1) Narrative sections from Claude Sonnet (graceful fallback on failure).
        try:
            narrative = await _draft_narrative(pii, injection, framework, decision)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Agent 4: narrative drafting failed (%s) — using fallback text", exc)
            narrative = {
                "executive_summary": (
                    f"Automated analysis completed with decision {decision}. "
                    f"PII findings: {len(pii.findings)}. Injection detected: "
                    f"{injection.injection_detected}. Framework mappings: "
                    f"{len(framework.mappings)}. Narrative drafting was unavailable; "
                    "structured findings below are authoritative."
                ),
                "severity_ranking": [
                    f"{m.severity.value}: {m.framework} {m.reference} — {m.violation}"
                    for m in sorted(
                        framework.mappings,
                        key=lambda m: ["Critical", "High", "Medium", "Low"].index(m.severity.value)
                        if m.severity.value in ("Critical", "High", "Medium", "Low") else 4,
                    )
                ],
                "remediation_recommendations": [m.remediation for m in framework.mappings if m.remediation],
                "digital_dubai_assessment": {},
            }

        # 2) Render PDF in a worker thread (ReportLab is synchronous).
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        pdf_path = REPORTS_DIR / f"haaris_report_{report_id}.pdf"
        await asyncio.to_thread(
            _render_pdf, pdf_path, report_id, decision, narrative, pii, injection, framework
        )

        dd_raw = narrative.get("digital_dubai_assessment", {}) or {}
        assessment = DigitalDubaiAssessment(
            accountability=str(dd_raw.get("accountability", "")),
            transparency=str(dd_raw.get("transparency", "")),
            fairness=str(dd_raw.get("fairness", "")),
            explainability=str(dd_raw.get("explainability", "")),
        )

        return ReportResults(
            model=f"groq/{REPORT_MODEL}",
            status=AgentStatus.COMPLETE,
            report_id=report_id,
            pdf_path=str(pdf_path),
            executive_summary=str(narrative.get("executive_summary", "")),
            severity_ranking=[str(s) for s in narrative.get("severity_ranking", [])],
            remediation_recommendations=[
                str(r) for r in narrative.get("remediation_recommendations", [])
            ],
            digital_dubai_assessment=assessment,
        )
    except Exception as exc:
        logger.error("Agent 4 failed: %s", exc)
        return ReportResults(
            model=f"groq/{REPORT_MODEL}",
            status=AgentStatus.ERROR,
            report_id=report_id,
            executive_summary="Report generation failed.",
            error=str(exc),
        )
