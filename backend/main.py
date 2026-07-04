"""
Haaris (حارس) — UAE LLM Compliance Guardrail
FastAPI application.

Endpoints:
    POST /api/analyze            — run the four-agent pipeline on a prompt/response pair
    GET  /api/report/{report_id} — download the generated PDF compliance report
    GET  /api/history            — list past analyses from the MongoDB audit trail
    GET  /api/health             — liveness / dependency status

Run with:
    uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # must run before modules read env vars at import time

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

from backend.database import db  # noqa: E402
from backend.models import (  # noqa: E402
    AnalyzeRequest,
    AnalyzeResponse,
    AnalysisInput,
    ErrorResponse,
    HistoryResponse,
)
from backend.orchestrator import run_analysis  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("haaris.main")

REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "./reports"))
_REPORT_ID_RE = re.compile(r"^[a-f0-9]{12}$")  # matches Agent 4's uuid4().hex[:12]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to MongoDB at startup, close cleanly at shutdown."""
    await db.connect()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    if not os.getenv("GROQ_API_KEY"):
        logger.warning(
            "GROQ_API_KEY is not set — Agents 2, 3, and 4 will fail. "
            "Create a .env file with GROQ_API_KEY=your_key (free at groq.com)."
        )
    yield
    await db.close()


app = FastAPI(
    title="Haaris (حارس) — UAE LLM Compliance Guardrail",
    description=(
        "Multi-agent, multi-LLM compliance analysis for UAE enterprises. "
        "Agent 1 detects UAE-specific PII locally with deterministic regex; "
        "Agents 2-4 classify prompt injection and map findings to UAE PDPL, "
        "Digital Dubai Ethical AI Guidelines, OWASP LLM Top 10, and MITRE "
        "ATLAS via the Groq API."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for the React frontend (Vite dev server / localhost:3000).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post(
    "/api/analyze",
    response_model=AnalyzeResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Analyze an LLM prompt/response pair",
)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Run the full four-agent pipeline and return the compliance decision."""
    try:
        analysis_input = AnalysisInput(
            prompt=request.prompt, response=request.response
        )
        result = await run_analysis(analysis_input)
        return AnalyzeResponse(
            analysis_id=result.analysis_id,
            decision=result.decision,
            decision_rationale=result.decision_rationale,
            agents=result.agents,
            report_url=result.report_url,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Analysis pipeline failed")
        raise HTTPException(
            status_code=500, detail=f"Analysis pipeline failed: {exc}"
        ) from exc


@app.get(
    "/api/report/{report_id}",
    responses={
        200: {"content": {"application/pdf": {}}},
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Download a compliance report PDF",
)
async def get_report(report_id: str) -> FileResponse:
    """Return the generated PDF for a completed analysis."""
    # Strict ID validation prevents any path traversal via the URL segment.
    if not _REPORT_ID_RE.fullmatch(report_id):
        raise HTTPException(status_code=400, detail="Invalid report ID format")

    pdf_path = (REPORTS_DIR / f"haaris_report_{report_id}.pdf").resolve()
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Report not found")

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"haaris_compliance_report_{report_id}.pdf",
    )


@app.get(
    "/api/history",
    response_model=HistoryResponse,
    summary="List past analyses from the audit trail",
)
async def get_history(limit: int = 50, skip: int = 0) -> HistoryResponse:
    """Return compact records of past analyses, newest first."""
    try:
        limit = max(1, min(limit, 200))
        skip = max(0, skip)
        if not db.available:
            # Mongo down — return an empty, well-formed response rather than 500.
            logger.warning("History requested but MongoDB is unavailable")
            return HistoryResponse(total=0, items=[])
        items = await db.get_history(limit=limit, skip=skip)
        total = await db.count_analyses()
        return HistoryResponse(total=total, items=items)
    except Exception as exc:
        logger.exception("Failed to fetch history")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch history: {exc}"
        ) from exc


@app.get(
    "/api/analysis/{analysis_id}",
    responses={404: {"model": ErrorResponse}},
    summary="Fetch a full past analysis by ID",
)
async def get_analysis(analysis_id: str):
    """Return the complete stored result for one analysis (used by History re-view)."""
    if not re.fullmatch(r"[a-f0-9]{32}", analysis_id):
        raise HTTPException(status_code=400, detail="Invalid analysis ID format")
    result = await db.get_analysis(analysis_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return result


@app.get("/api/health", summary="Liveness and dependency status")
async def health() -> dict:
    """Basic health check for monitoring and the frontend."""
    return {
        "status": "ok",
        "architecture": "hybrid — local regex PII detection + Groq cloud reasoning",
        "mongodb": db.available,
        "groq_key_configured": bool(os.getenv("GROQ_API_KEY")),
        "agents": {
            "agent1_pii_detector": "regex (deterministic — no LLM)",
            "agent2_input_validator": f"groq/{os.getenv('VALIDATOR_MODEL', 'llama-3.1-8b-instant')}",
            "agent3_framework_mapper": f"groq/{os.getenv('MAPPER_MODEL', 'llama-3.3-70b-versatile')}",
            "agent4_report_generator": f"groq/{os.getenv('REPORT_MODEL', 'llama-3.3-70b-versatile')}",
        },
    }
