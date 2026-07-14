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

PDF notes:
- Every dynamic string is XML-escaped before entering a Paragraph — LLM
  narrative and matched text can legally contain "&", "<", ">".
- The PDF wordmark is the latin "Haaris" only: the built-in Helvetica has
  no Arabic glyphs, so "حارس" would render as boxes without an embedded,
  shaped Arabic font. The UI keeps the Arabic wordmark.
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
from xml.sax.saxutils import escape as _xml_escape

from groq import AsyncGroq
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
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
_RULE = colors.HexColor("#D8D8D8")

_SEVERITY_COLORS = {
    Severity.CRITICAL: colors.HexColor("#B00020"),
    Severity.HIGH: colors.HexColor("#D9534F"),
    Severity.MEDIUM: colors.HexColor("#C9852A"),
    Severity.LOW: colors.HexColor("#2E7D32"),
    Severity.NONE: colors.HexColor("#607D8B"),
}

_DECISION_COLORS = {
    "COMPLIANT": _UAE_GREEN,
    "REVIEW": colors.HexColor("#C9852A"),
    "NON-COMPLIANT": _UAE_RED,
}

_DECISION_TINTS = {
    "COMPLIANT": colors.HexColor("#EAF6EE"),
    "REVIEW": colors.HexColor("#FAF3E6"),
    "NON-COMPLIANT": colors.HexColor("#FCEBEC"),
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


def _esc(value) -> str:
    """XML-escape any dynamic value before it enters a ReportLab Paragraph."""
    return _xml_escape(str(value if value is not None else ""))


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

class _NumberedCanvas(Canvas):
    """Canvas that draws a running footer with 'Page X of Y' on every page."""

    report_id = ""  # set per-document before build()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_states: list[dict] = []

    def showPage(self):
        self._saved_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_states)
        for state in self._saved_states:
            self.__dict__.update(state)
            self._draw_footer(page_count)
            super().showPage()
        super().save()

    def _draw_footer(self, page_count: int):
        width, _ = A4
        self.saveState()
        self.setStrokeColor(_RULE)
        self.setLineWidth(0.5)
        self.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(_MUTED)
        self.drawString(
            18 * mm,
            10 * mm,
            f"Haaris — LLM Compliance Report · {self.report_id} · Confidential",
        )
        self.drawRightString(
            width - 18 * mm, 10 * mm, f"Page {self._pageNumber} of {page_count}"
        )
        self.restoreState()


def _section(title: str, style: ParagraphStyle, first_block) -> KeepTogether:
    """Keep a section heading attached to its first content block."""
    return KeepTogether([Paragraph(title, style), first_block])


def _severity_cell(severity: Severity, base: ParagraphStyle) -> Paragraph:
    color = _SEVERITY_COLORS.get(severity, _MUTED)
    style = ParagraphStyle(
        f"sev_{severity.value}", parent=base, textColor=color, fontName="Helvetica-Bold"
    )
    return Paragraph(_esc(severity.value), style)


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
        fontSize=19,
        textColor=_UAE_BLACK,
        alignment=TA_CENTER,
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "HaarisSubtitle",
        parent=styles["Normal"],
        fontSize=9.5,
        textColor=_MUTED,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
    h2 = ParagraphStyle(
        "HaarisH2",
        parent=styles["Heading2"],
        fontSize=12.5,
        textColor=_UAE_BLACK,
        spaceBefore=16,
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "HaarisBody", parent=styles["Normal"], fontSize=9.5, leading=14.5
    )
    cell = ParagraphStyle("HaarisCell", parent=body, fontSize=8, leading=11)
    label = ParagraphStyle(
        "HaarisLabel", parent=cell, textColor=_MUTED, fontName="Helvetica-Bold"
    )

    decision_color = _DECISION_COLORS.get(decision, _MUTED)
    decision_tint = _DECISION_TINTS.get(decision, colors.HexColor("#F2F2F2"))

    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=22 * mm,  # clears the running footer
        title=f"Haaris Compliance Report {report_id}",
        author="Haaris — UAE LLM Compliance Guardrail",
        subject="Automated LLM compliance analysis",
    )
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    story: list = []
    story.append(Paragraph("Haaris — LLM Compliance Report", title_style))
    story.append(
        Paragraph("UAE LLM Compliance Guardrail · Automated Analysis", subtitle_style)
    )
    # UAE flag tricolor rule
    for color in (_UAE_GREEN, colors.white, _UAE_BLACK, _UAE_RED):
        story.append(HRFlowable(width="100%", thickness=2, color=color, spaceAfter=0))
    story.append(Spacer(1, 14))

    # Decision banner — single-cell tinted table reads as a proper verdict block
    banner = Table(
        [
            [
                Paragraph(
                    f"Decision: <b>{_esc(decision)}</b>",
                    ParagraphStyle(
                        "HaarisDecision",
                        parent=styles["Normal"],
                        fontSize=14,
                        textColor=decision_color,
                        alignment=TA_CENTER,
                    ),
                )
            ]
        ],
        colWidths=[doc.width],
    )
    banner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), decision_tint),
                ("BOX", (0, 0), (-1, -1), 0.75, decision_color),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    story.append(banner)
    story.append(Spacer(1, 8))

    # Analysis metadata block
    meta_rows = [
        [Paragraph("Report ID", label), Paragraph(_esc(report_id), cell),
         Paragraph("Generated", label), Paragraph(_esc(generated_at), cell)],
        [Paragraph("PII findings", label), Paragraph(str(len(pii.findings)), cell),
         Paragraph("Injection detected", label),
         Paragraph("Yes" if injection.injection_detected else "No", cell)],
        [Paragraph("Framework mappings", label), Paragraph(str(len(framework.mappings)), cell),
         Paragraph("Frameworks assessed", label),
         Paragraph("UAE PDPL · Digital Dubai · OWASP LLM Top 10 · MITRE ATLAS", cell)],
    ]
    meta = Table(meta_rows, colWidths=[32 * mm, 55 * mm, 34 * mm, None])
    meta.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, _RULE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta)

    story.append(
        _section(
            "Executive Summary",
            h2,
            Paragraph(_esc(narrative.get("executive_summary", "N/A")), body),
        )
    )

    # PII findings table
    story.append(
        _section(
            "Agent 1 — UAE PII Detection", h2, Paragraph(_esc(pii.summary or "N/A"), body)
        )
    )
    if pii.findings:
        rows = [
            [Paragraph(h, ParagraphStyle("th", parent=cell, textColor=colors.white,
                                         fontName="Helvetica-Bold"))
             for h in ("Type", "Location", "Match (masked)", "Severity")]
        ]
        for f in pii.findings:
            rows.append(
                [
                    Paragraph(_esc(f.pii_type.value), cell),
                    Paragraph(_esc(f.location), cell),
                    Paragraph(_esc(f.matched_text), cell),
                    _severity_cell(f.severity, cell),
                ]
            )
        table = Table(rows, colWidths=[45 * mm, 22 * mm, 65 * mm, 25 * mm], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), _UAE_GREEN),
                    ("GRID", (0, 0), (-1, -1), 0.4, _RULE),
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
    inj_text = (
        f"Detected: <b>{'Yes' if injection.injection_detected else 'No'}</b> &nbsp;|&nbsp; "
        f"Type: {_esc(injection.injection_type.value)} &nbsp;|&nbsp; "
        f"Confidence: {injection.confidence:.2f} &nbsp;|&nbsp; "
        f"Severity: {_esc(injection.severity.value)}<br/>{_esc(injection.rationale)}"
    )
    story.append(
        _section("Agent 2 — Input/Output Validation", h2, Paragraph(inj_text, body))
    )

    # Framework mappings table
    story.append(
        _section(
            "Agent 3 — Framework Mapping",
            h2,
            Paragraph(_esc(framework.summary or "N/A"), body),
        )
    )
    if framework.mappings:
        rows = [
            [Paragraph(h, ParagraphStyle("th2", parent=cell, textColor=colors.white,
                                         fontName="Helvetica-Bold"))
             for h in ("Framework", "Reference", "Violation", "Severity")]
        ]
        for m in framework.mappings:
            rows.append(
                [
                    Paragraph(_esc(m.framework), cell),
                    Paragraph(_esc(m.reference), cell),
                    Paragraph(_esc(m.violation), cell),
                    _severity_cell(m.severity, cell),
                ]
            )
        table = Table(rows, colWidths=[38 * mm, 28 * mm, 70 * mm, 22 * mm], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), _UAE_BLACK),
                    ("GRID", (0, 0), (-1, -1), 0.4, _RULE),
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
        story.append(
            _section("Severity Ranking", h2, Paragraph(f"1. {_esc(ranking[0])}", body))
        )
        for i, item in enumerate(ranking[1:], 2):
            story.append(Paragraph(f"{i}. {_esc(item)}", body))

    # Remediation
    recs = narrative.get("remediation_recommendations", [])
    if recs:
        story.append(
            _section(
                "Remediation Recommendations", h2, Paragraph(f"1. {_esc(recs[0])}", body)
            )
        )
        for i, rec in enumerate(recs[1:], 2):
            story.append(Paragraph(f"{i}. {_esc(rec)}", body))

    # Digital Dubai assessment
    dd = narrative.get("digital_dubai_assessment", {})
    if dd:
        pillars = ("accountability", "transparency", "fairness", "explainability")
        first = Paragraph(
            f"<b>{pillars[0].title()}:</b> {_esc(dd.get(pillars[0], 'N/A'))}", body
        )
        story.append(_section("Digital Dubai AI Ethics Self-Assessment", h2, first))
        for pillar in pillars[1:]:
            story.append(
                Paragraph(f"<b>{pillar.title()}:</b> {_esc(dd.get(pillar, 'N/A'))}", body)
            )

    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.75, color=_RULE))
    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            "Generated by Haaris — UAE LLM Compliance Guardrail. "
            "This report is an automated analysis aid and does not constitute legal advice.",
            ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=_MUTED),
        )
    )

    canvas_cls = type("_Canvas", (_NumberedCanvas,), {"report_id": report_id})
    doc.build(story, canvasmaker=canvas_cls)


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
        # 1) Narrative sections from Groq (graceful fallback on failure).
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
