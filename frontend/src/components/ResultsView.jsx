import { useEffect, useRef, useState } from 'react'
import FrameworkMap from './FrameworkMap.jsx'
import { downloadReport } from '../api.js'

const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low', 'None']

// ---------------------------------------------------------------------------
// Verdict header — the answer first: decision, rationale, counts, PDF.
// Sticky so the verdict and export stay visible while reading evidence.
// ---------------------------------------------------------------------------

function VerdictHeader({ result }) {
  const { decision, decision_rationale, agents } = result
  const { pii, injection, framework, report } = agents
  const [downloadError, setDownloadError] = useState(null)

  const handleDownload = async () => {
    setDownloadError(null)
    try {
      await downloadReport(report.report_id)
    } catch {
      setDownloadError('Report download failed — the PDF may not have been generated for this analysis.')
    }
  }

  return (
    <header className="verdict-header card">
      <div className="verdict-main">
        <span className={`verdict-chip chip-${decision}`} role="status">{decision}</span>
        <div className="verdict-text">
          {decision_rationale && <p className="verdict-rationale">{decision_rationale}</p>}
          <p className="verdict-meta">
            {pii.findings.length} PII finding{pii.findings.length === 1 ? '' : 's'}
            {' · '}injection {injection.injection_detected ? 'detected' : 'not detected'}
            {' · '}{framework.mappings.length} framework mapping{framework.mappings.length === 1 ? '' : 's'}
          </p>
        </div>
        {report.report_id && !report.error && (
          <button className="download-btn" onClick={handleDownload}>
            Download PDF
          </button>
        )}
      </div>
      {downloadError && <div className="agent-error" role="alert">{downloadError}</div>}
    </header>
  )
}

// ---------------------------------------------------------------------------
// Findings tab — one severity-ordered list across agents
// ---------------------------------------------------------------------------

const MASK_NOTE =
  'Value masked — raw identifiers are never stored or sent to cloud APIs.'

function collectFindings({ pii, injection }) {
  const findings = pii.findings.map((f) => ({
    severity: f.severity,
    agent: 'PII Detector',
    text: `${f.pii_type} in ${f.location} — ${f.matched_text}`,
    masked: true,
  }))
  if (injection.injection_detected) {
    findings.push({
      severity: injection.severity,
      agent: 'Validator',
      text:
        `${injection.injection_type} — confidence ${(injection.confidence * 100).toFixed(0)}%` +
        (injection.extracted_payload ? ` · payload: "${injection.extracted_payload}"` : ''),
    })
  }
  return findings.sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )
}

function ConfidenceGauge({ confidence }) {
  const [pct, setPct] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setPct(Math.min(Math.max(confidence, 0), 1)), 80)
    return () => clearTimeout(t)
  }, [confidence])

  const HALF_CIRC = Math.PI * 44
  const offset = HALF_CIRC * (1 - pct)
  const color = pct < 0.4 ? 'var(--c4)' : pct < 0.75 ? 'var(--c3)' : 'var(--c5)'
  const label = pct < 0.4 ? 'Low' : pct < 0.75 ? 'Suspicious' : 'Confirmed'

  return (
    <div className="conf-gauge">
      <svg width="120" height="70" viewBox="0 0 120 70"
        aria-label={`Injection confidence: ${Math.round(pct * 100)}%`}>
        <path d="M16 60 A44 44 0 0 1 104 60" fill="none" stroke="var(--track)"
          strokeWidth="8" strokeLinecap="round" />
        <path d="M16 60 A44 44 0 0 1 104 60" fill="none" stroke={color}
          strokeWidth="8" strokeLinecap="round" strokeDasharray={HALF_CIRC}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.25,0.8,0.3,1), stroke 0.4s ease' }} />
        <text x="60" y="54" textAnchor="middle" fill="var(--text)" fontSize="17"
          fontWeight="600" fontFamily="Inter, -apple-system, sans-serif">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="conf-label">
        <span style={{ color }}>{label}</span> · injection confidence
      </div>
    </div>
  )
}

const SEV_COLOR = {
  Critical: 'var(--sev-critical)',
  High: 'var(--sev-high)',
  Medium: 'var(--sev-medium)',
  Low: 'var(--sev-low)',
  None: 'var(--sev-none)',
}

function PIIBreakdown({ findings }) {
  if (!findings || findings.length === 0) return null

  const groups = {}
  for (const f of findings) {
    if (!groups[f.pii_type]) groups[f.pii_type] = { count: 0, severity: f.severity }
    groups[f.pii_type].count++
  }
  const entries = Object.entries(groups).sort((a, b) => b[1].count - a[1].count)
  const maxCount = Math.max(...entries.map(([, v]) => v.count))

  return (
    <div className="pii-breakdown">
      <span className="eyebrow">PII breakdown</span>
      {entries.map(([type, { count, severity }]) => (
        <div key={type} className="pii-bar-row">
          <div className="pii-bar-label">{type}</div>
          <div className="pii-bar-track">
            <div className="pii-bar-fill"
              style={{ '--bar-w': `${(count / maxCount) * 100}%`, background: SEV_COLOR[severity] || 'var(--accent)' }} />
          </div>
          <div className="pii-bar-count">{count}×</div>
        </div>
      ))}
    </div>
  )
}

function AgentStatusStrip({ agents }) {
  const modelPill = (m) => {
    if (!m) return 'unknown'
    return m
      .replace('groq/', 'Groq · ')
      .replace('llama-3.1-8b-instant', 'Llama 3.1 8B')
      .replace('llama-3.3-70b-versatile', 'Llama 3.3 70B')
  }
  const entries = [
    { label: 'PII Detector', data: agents.pii },
    { label: 'Validator', data: agents.injection },
    { label: 'Framework Mapper', data: agents.framework },
    { label: 'Report Generator', data: agents.report },
  ]
  return (
    <div className="agent-status-strip">
      <span className="eyebrow">Pipeline</span>
      <div className="agent-status-chips">
        {entries.map(({ label, data }) => (
          <span key={label} className={`agent-status-chip ${data.error ? 'errored' : ''}`}
            title={data.error ? `Error: ${data.error}` : modelPill(data.model)}>
            <span className="agent-status-mark" aria-hidden="true">{data.error ? '✕' : '✓'}</span>
            {label}
          </span>
        ))}
      </div>
      {entries.filter((e) => e.data.error).map(({ label, data }) => (
        <div key={label} className="agent-error" role="alert">
          {label} error: {data.error}
        </div>
      ))}
    </div>
  )
}

function FindingsTab({ agents }) {
  const findings = collectFindings(agents)

  return (
    <div>
      {findings.length === 0 ? (
        <p className="findings-empty">No findings — the pair looks clean.</p>
      ) : (
        <ul className="findings-table">
          {findings.map((f, i) => (
            <li key={i}>
              <span className={`severity-badge sev-${f.severity}`}>{f.severity}</span>
              <span className="finding-text">
                {f.text}
                {f.masked && (
                  <span className="mask-info" tabIndex={0} role="note"
                    aria-label={MASK_NOTE} data-tip={MASK_NOTE}>ⓘ</span>
                )}
              </span>
              <span className="finding-agent">{f.agent}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="findings-aux">
        <PIIBreakdown findings={agents.pii.findings} />
        <ConfidenceGauge confidence={agents.injection.confidence ?? 0} />
      </div>

      <AgentStatusStrip agents={agents} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Report tab — narrative sections + analysis ID
// ---------------------------------------------------------------------------

function AnalysisIdStrip({ analysisId }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  if (!analysisId) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(analysisId)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — leave the ID selectable */
    }
  }

  return (
    <div className="analysis-id-strip">
      <span className="hash-mono">Analysis ID: {analysisId}</span>
      <button className="copy-btn" onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy analysis ID'}>
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  )
}

function ReportTab({ report, analysisId }) {
  return (
    <div>
      <span className="eyebrow">Executive summary</span>
      <p style={{ marginTop: 8 }}>{report.executive_summary || 'No summary available.'}</p>

      {report.severity_ranking?.length > 0 && (
        <>
          <span className="eyebrow" style={{ display: 'block', marginTop: 20 }}>Severity ranking</span>
          <ol className="report-list">
            {report.severity_ranking.map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </>
      )}

      {report.remediation_recommendations?.length > 0 && (
        <>
          <span className="eyebrow" style={{ display: 'block', marginTop: 20 }}>Remediation</span>
          <ol className="report-list">
            {report.remediation_recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </>
      )}

      <AnalysisIdStrip analysisId={analysisId} />
    </div>
  )
}

function EthicsTab({ assessment }) {
  return (
    <div className="dd-grid">
      {[
        { key: 'accountability', label: 'Accountability' },
        { key: 'transparency', label: 'Transparency' },
        { key: 'fairness', label: 'Fairness' },
        { key: 'explainability', label: 'Explainability' },
      ].map(({ key, label }) => (
        <div key={key} className="dd-card">
          <span className="eyebrow">{label}</span>
          <p className="dd-text">{assessment?.[key] || 'No assessment provided.'}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view: verdict header + tabbed evidence
// ---------------------------------------------------------------------------

export default function ResultsView({ result }) {
  const { analysis_id, agents } = result
  const { pii, injection, framework, report } = agents
  const [tab, setTab] = useState('findings')

  const findingsCount = pii.findings.length + (injection.injection_detected ? 1 : 0)
  const tabs = [
    { id: 'findings', label: `Findings (${findingsCount})` },
    { id: 'frameworks', label: `Frameworks (${framework.mappings.length})` },
    { id: 'ethics', label: 'Ethics' },
    { id: 'report', label: 'Report' },
  ]

  return (
    <div className="results fade-up">
      <VerdictHeader result={result} />

      <div className="evidence-tabs" role="tablist" aria-label="Evidence">
        {tabs.map(({ id, label }) => (
          <button key={id} role="tab" aria-selected={tab === id}
            className={`evidence-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="evidence-panel card">
        {tab === 'findings' && <FindingsTab agents={agents} />}
        {tab === 'frameworks' && <FrameworkMap framework={framework} />}
        {tab === 'ethics' && <EthicsTab assessment={report.digital_dubai_assessment} />}
        {tab === 'report' && <ReportTab report={report} analysisId={analysis_id} />}
      </div>
    </div>
  )
}
