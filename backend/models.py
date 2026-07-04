"""
Haaris (حارس) — UAE LLM Compliance Guardrail
Pydantic models shared across agents, orchestrator, database, and API.

Every agent input and output is a Pydantic model — no raw dicts anywhere.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    """Severity ranking used across all agents."""
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    NONE = "None"


class Decision(str, Enum):
    """Final orchestrator decision."""
    COMPLIANT = "COMPLIANT"
    REVIEW = "REVIEW"
    NON_COMPLIANT = "NON-COMPLIANT"


class PIIType(str, Enum):
    """UAE-specific PII categories detected by Agent 1."""
    EMIRATES_ID = "Emirates ID"
    UAE_PHONE = "UAE Phone Number"
    UAE_PASSPORT = "UAE Passport Number"
    TRADE_LICENSE = "Trade License Number"
    ARABIC_PII = "Arabic-Language PII"
    CORPORATE_TELEMETRY = "Corporate Telemetry"
    EMAIL = "Email Address"
    IBAN = "UAE IBAN"
    OTHER = "Other Sensitive Identifier"


class InjectionType(str, Enum):
    """Prompt-injection categories classified by Agent 2."""
    DIRECT = "Direct Prompt Injection"
    INDIRECT = "Indirect Prompt Injection"
    JAILBREAK = "Jailbreak Attempt"
    GOAL_HIJACKING = "Goal Hijacking"
    PROMPT_LEAKING = "Prompt Leaking"
    NONE = "None Detected"


class AgentStatus(str, Enum):
    """Per-agent execution status."""
    COMPLETE = "complete"
    ERROR = "error"
    SKIPPED = "skipped"


# ---------------------------------------------------------------------------
# Shared input
# ---------------------------------------------------------------------------

class AnalysisInput(BaseModel):
    """The prompt/response pair submitted for analysis."""
    prompt: str = Field(..., min_length=1, description="The prompt sent to the LLM")
    response: str = Field(..., min_length=1, description="The response received from the LLM")


# ---------------------------------------------------------------------------
# Agent 1 — UAE PII Detector (local regex)
# ---------------------------------------------------------------------------

class PIIFinding(BaseModel):
    """A single detected PII occurrence."""
    pii_type: PIIType
    matched_text: str = Field(..., description="The matched text, partially masked for the audit log")
    location: str = Field(..., description="'prompt' or 'response'")
    start: int = Field(..., ge=0, description="Character offset of the match start")
    end: int = Field(..., ge=0, description="Character offset of the match end")
    severity: Severity
    detection_method: str = Field(..., description="'regex' or 'llm'")


class PIIResults(BaseModel):
    """Agent 1 output."""
    agent: str = "Agent 1 — UAE PII Detector"
    model: str = Field(..., description="Detection engine, e.g. 'regex (deterministic)'")
    status: AgentStatus = AgentStatus.COMPLETE
    findings: list[PIIFinding] = Field(default_factory=list)
    highest_severity: Severity = Severity.NONE
    summary: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Agent 2 — Input/Output Validator (Claude Haiku)
# ---------------------------------------------------------------------------

class InjectionResults(BaseModel):
    """Agent 2 output."""
    agent: str = "Agent 2 — Input/Output Validator"
    model: str = Field(..., description="Claude model ID used")
    status: AgentStatus = AgentStatus.COMPLETE
    injection_detected: bool = False
    injection_type: InjectionType = InjectionType.NONE
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    extracted_payload: Optional[str] = Field(
        None, description="The suspicious span of text, if any"
    )
    severity: Severity = Severity.NONE
    rationale: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Agent 3 — Framework Mapper (Claude Sonnet)
# ---------------------------------------------------------------------------

class FrameworkMapping(BaseModel):
    """A single framework → violation mapping."""
    framework: str = Field(..., description="e.g. 'UAE PDPL', 'OWASP LLM Top 10', 'MITRE ATLAS', 'Digital Dubai Ethical AI Guidelines', 'UAE National AI Security Policy'")
    reference: str = Field(..., description="Specific article, category, technique, or pillar (e.g. 'LLM06', 'AML.T0051', 'Article 5')")
    violation: str = Field(..., description="Plain-language description of the violation")
    severity: Severity
    remediation: str = Field(..., description="Recommended remediation step")


class FrameworkResults(BaseModel):
    """Agent 3 output."""
    agent: str = "Agent 3 — Framework Mapper"
    model: str = Field(..., description="Claude model ID used")
    status: AgentStatus = AgentStatus.COMPLETE
    mappings: list[FrameworkMapping] = Field(default_factory=list)
    pdpl_violation: bool = False
    highest_severity: Severity = Severity.NONE
    summary: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Agent 4 — Compliance Report Generator (Claude Sonnet + ReportLab)
# ---------------------------------------------------------------------------

class DigitalDubaiAssessment(BaseModel):
    """JSON payload aligned with the Digital Dubai AI Ethics Self-Assessment pillars."""
    accountability: str = ""
    transparency: str = ""
    fairness: str = ""
    explainability: str = ""


class ReportResults(BaseModel):
    """Agent 4 output."""
    agent: str = "Agent 4 — Compliance Report Generator"
    model: str = Field(..., description="Claude model ID used")
    status: AgentStatus = AgentStatus.COMPLETE
    report_id: str = ""
    pdf_path: Optional[str] = None
    executive_summary: str = ""
    severity_ranking: list[str] = Field(
        default_factory=list,
        description="Findings ordered Critical → Low as human-readable strings",
    )
    remediation_recommendations: list[str] = Field(default_factory=list)
    digital_dubai_assessment: DigitalDubaiAssessment = Field(
        default_factory=DigitalDubaiAssessment
    )
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Orchestrator / full analysis result
# ---------------------------------------------------------------------------

class AgentOutputs(BaseModel):
    """All four agent outputs, grouped."""
    pii: PIIResults
    injection: InjectionResults
    framework: FrameworkResults
    report: ReportResults


class AnalysisResult(BaseModel):
    """The complete result of one analysis run — what gets stored in MongoDB."""
    analysis_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    input_hash: str = Field(..., description="SHA-256 of prompt+response for the audit trail")
    decision: Decision
    decision_rationale: str = ""
    agents: AgentOutputs
    report_url: Optional[str] = None


# ---------------------------------------------------------------------------
# API request/response models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    """POST /api/analyze request body."""
    prompt: str = Field(..., min_length=1, max_length=100_000)
    response: str = Field(..., min_length=1, max_length=100_000)


class AnalyzeResponse(BaseModel):
    """POST /api/analyze response body."""
    analysis_id: str
    decision: Decision
    decision_rationale: str
    agents: AgentOutputs
    report_url: Optional[str] = None


class HistoryItem(BaseModel):
    """Compact record for GET /api/history."""
    analysis_id: str
    created_at: datetime
    input_hash: str
    decision: Decision
    pii_findings_count: int = 0
    injection_detected: bool = False
    highest_severity: Severity = Severity.NONE


class HistoryResponse(BaseModel):
    """GET /api/history response body."""
    total: int
    items: list[HistoryItem]


class ErrorResponse(BaseModel):
    """Standard error envelope."""
    detail: str
