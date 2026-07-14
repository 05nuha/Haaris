# Haaris (حارس) — UAE LLM Compliance Guardrail

Multi-agent compliance analysis for UAE enterprises. Paste an LLM prompt/response pair and four agents scan it:

1. **Agent 1 — UAE PII Detector** · deterministic local regex (Emirates IDs, UAE phones, passports, IBANs, trade licenses). Raw text never leaves the process — downstream agents see redacted text only.
2. **Agent 2 — Input/Output Validator** · prompt-injection classification (Groq · Llama 3.1 8B).
3. **Agent 3 — Framework Mapper** · maps findings to **UAE PDPL**, **Digital Dubai Ethical AI Guidelines**, **OWASP LLM Top 10**, and **MITRE ATLAS** (Groq · Llama 3.3 70B).
4. **Agent 4 — Report Generator** · executive narrative (Groq) + a professional **PDF compliance report** (ReportLab) with severity tables, decision banner, and page-numbered running footer.

Final verdict: **COMPLIANT / REVIEW / NON-COMPLIANT**, with a MongoDB audit trail (input hashes, not raw text). The pipeline degrades fail-safe: agent errors force REVIEW, and PDF generation falls back to structured findings when the LLM narrative is unavailable.

## Stack

- **Backend:** FastAPI (async), Groq API, Motor/MongoDB, ReportLab — `backend/`
- **Frontend:** React 18 + Vite — `frontend/` (deep spruce-green theme, minimal and matte; one green accent; color reserved for severity)

## Run locally

### Backend

```bash
pip install -r backend/requirements.txt
cp .env.example .env          # add GROQ_API_KEY (free at groq.com)
uvicorn backend.main:app --reload --port 8000
```

MongoDB (optional, for the audit trail): run locally on `mongodb://localhost:27017` or set `MONGO_URI`. Without it the API still works — history is just empty.

Without `GROQ_API_KEY`, Agent 1 (local regex) and PDF generation still work; Agents 2–3 report errors and the decision falls back to fail-safe behavior.

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Set `VITE_API_URL` for a non-local backend (see `frontend/.env.example`).

### Tests

```bash
python -m pytest backend/tests/
```

## Notes on the 2026-07 optimization pass

- **PDF hardening:** all LLM/user-derived text is XML-escaped before rendering (previously `&`/`<` in a narrative crashed ReportLab); every table cell wraps in a Paragraph so long masked values wrap instead of overflowing; severity cells are color-coded; added a tinted decision banner, an analysis-metadata block, repeated table headers across page breaks, and a running footer with `Page X of Y`. The PDF wordmark uses latin "Haaris" — Helvetica has no Arabic glyphs, so "حارس" rendered as boxes before.
- **UI redesign:** replaced the dark glassmorphism theme (grain overlay, floating particles, typing animation, gradient text, 8 pastel accents) with clean, human-centric minimalism — warm neutrals, 1px borders, generous whitespace, Inter, and a single green accent; color now only encodes meaning (severity, decisions). No functional behavior changed.
- Verified end-to-end: real backend + frontend driven by browser automation (analyze → results → PDF download all working), `vite build` clean, 23 backend tests passing.
