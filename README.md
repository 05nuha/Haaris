# Haaris (حارس) — UAE LLM Compliance Guardrail

A four-agent pipeline that audits LLM prompt/response pairs for UAE-regulated personal data and AI risk, and produces a signed-off compliance verdict with a PDF report.

**Verdicts:** `COMPLIANT` · `REVIEW` · `NON-COMPLIANT`

## Why it exists

Companies deploying LLMs in the UAE must comply with the **UAE PDPL (Federal Decree-Law No. 45 of 2021)** — but most guardrail tooling is US/EU-centric and misses UAE identifiers (Emirates ID, UAE IBAN, trade licenses, +971 numbers). Haaris checks the actual local regulations and maps every finding to international AI-risk frameworks.

## Architecture

```
           prompt / response pair
                    │
   ┌────────────────▼─────────────────┐
   │ Agent 1 · PII Detector (local)   │  pure regex — Emirates ID, UAE phone,
   │                                  │  passport, trade license, email, IBAN
   └────────────────┬─────────────────┘
                    │  redact() strips all PII before anything leaves the process
   ┌────────────────▼─────────────────┐
   │ Agent 2 · Input Validator (LLM)  │  prompt-injection & unsafe-content checks
   └────────────────┬─────────────────┘
   ┌────────────────▼─────────────────┐
   │ Agent 3 · Framework Mapper (LLM) │  UAE PDPL articles · OWASP LLM Top 10
   │                                  │  · MITRE ATLAS technique IDs
   └────────────────┬─────────────────┘
   ┌────────────────▼─────────────────┐
   │ Agent 4 · Report Generator       │  PDF compliance report (ReportLab)
   └────────────────┬─────────────────┘
                    ▼
     verdict + audit trail (input-hash + full result → MongoDB)
```

**Privacy by design:** Agent 1 is deterministic local regex — raw text never leaves the process. Cloud LLM calls (Groq) only ever see redacted text or masked findings, so the security layer itself cannot create a new PDPL violation.

## Stack

- **Backend:** FastAPI · Pydantic · Motor (async MongoDB) · Groq (Llama 3.x) · ReportLab
- **Frontend:** React + Vite dashboard — live agent pipeline view, framework map, history
- **Deploy:** Render (API) + Vercel (frontend)

## Quick start

```bash
# backend
pip install -r backend/requirements.txt
cp .env.example .env          # add your free Groq key
uvicorn backend.main:app --reload --port 8000

# frontend
cd frontend && npm install && npm run dev
```

### API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/analyze` | run the four-agent pipeline on a prompt/response pair |
| `GET /api/report/{id}` | download the PDF compliance report |
| `GET /api/history` | past analyses from the MongoDB audit trail |
| `GET /api/health` | liveness / dependency status |

## Decision logic

- **NON-COMPLIANT** — unredacted high-risk PII would have reached a model, or a confirmed injection/critical framework violation
- **REVIEW** — medium-severity findings needing a human look
- **COMPLIANT** — no findings above threshold; full reasoning recorded in the audit trail
