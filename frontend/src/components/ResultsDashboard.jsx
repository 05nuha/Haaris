import { useEffect, useRef, useState } from 'react'
import AgentCard from './AgentCard.jsx'
import FrameworkMap from './FrameworkMap.jsx'
import PipelineFlow from './PipelineFlow.jsx'
import { downloadReport } from '../api.js'

// ---------------------------------------------------------------------------
// Confidence gauge — SVG semicircle arc, animates from 0 on mount
// ---------------------------------------------------------------------------

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
      <svg
        width="120"
        height="70"
        viewBox="0 0 120 70"
        aria-label={`Injection confidence: ${Math.round(pct * 100)}%`}
      >
        <path
          d="M16 60 A44 44 0 0 1 104 60"
          fill="none"
          stroke="var(--track)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M16 60 A44 44 0 0 1 104 60"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={HALF_CIRC}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.25,0.8,0.3,1), stroke 0.4s ease',
          }}
        />
        <text
          x="60"
          y="54"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="17"
          fontWeight="600"
          fontFamily="Inter, -apple-system, sans-serif"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="conf-label">
        <span style={{ color }}>{label}</span>{' '}· injection confidence
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PII breakdown — horizontal bars per PII type, colored by severity
// ---------------------------------------------------------------------------

const SEV_COLOR = {
  Critical: 'var(--c5)',
  High:     'var(--c8)',
  Medium:   'var(--c3)',
  Low:      'var(--c6)',
  None:     'var(--c4)',
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
      {entries.map(([type, { count, severity }], idx) => (
        <div key={type} className="pii-bar-row" style={{ '--bar-idx': idx }}>
          <div className="pii-bar-label">{type}</div>
          <div className="pii-bar-track">
            <div
              className="pii-bar-fill"
              style={{
                '--bar-w': `${(count / maxCount) * 100}%`,
                background: SEV_COLOR[severity] || 'var(--c1)',
              }}
            />
          </div>
          <div className="pii-bar-count">{count}×</div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Risk summary strip — report.severity_ranking rendered as ranked chips
// ---------------------------------------------------------------------------

function RiskSummary({ ranking }) {
  if (!ranking || ranking.length === 0) return null

  // Entries look like "Critical: PDPL Article 5 violation" — the leading
  // word decides the chip color.
  const levelOf = (entry) => {
    const head = entry.split(':')[0].trim()
    return ['Critical', 'High', 'Medium', 'Low'].includes(head) ? head : null
  }

  return (
    <div className="risk-summary fade-up">
      <span className="eyebrow">Risk summary</span>
      <div className="risk-chips">
        {ranking.map((entry, i) => {
          const level = levelOf(entry)
          return (
            <span
              key={i}
              className={`risk-chip ${level ? `risk-${level}` : ''}`}
              style={{ '--i': i }}
            >
              {entry}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Analysis ID strip with copy-to-clipboard
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
      <button
        className="copy-btn"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy analysis ID'}
      >
        {copied ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 8.5l3.5 3.5 6.5-8" fill="none" stroke="var(--c4)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none"
              stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
              fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function ResultsDashboard({ result, onNewAnalysis }) {
  const { analysis_id, decision, decision_rationale, agents } = result
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

  const modelPill = (m) => {
    if (!m) return 'unknown'
    if (m.startsWith('groq/')) {
      const name = m.replace('groq/', '')
        .replace('llama-3.1-8b-instant', 'Llama 3.1 8B')
        .replace('llama-3.3-70b-versatile', 'Llama 3.3 70B')
      return `Groq · ${name}`
    }
    if (m.startsWith('ollama/')) return `Ollama · ${m.replace('ollama/', '')}`
    return m
  }

  const ddAssessment = report.digital_dubai_assessment

  return (
    <div className="results">

      {onNewAnalysis && (
        <div className="results-toolbar">
          <button className="new-analysis-btn" onClick={onNewAnalysis}>
            ← Analyze new pair
          </button>
        </div>
      )}

      {/* Pipeline flow — four nodes showing each agent's outcome severity */}
      <PipelineFlow agents={agents} />

      {/* Decision verdict */}
      <div className={`decision-wrap decision-${decision}`}>
        <div className="decision-badge" role="status">{decision}</div>
        {decision_rationale && <p className="decision-rationale">{decision_rationale}</p>}
      </div>

      {/* Risk summary — pre-ranked findings from Agent 4 */}
      <RiskSummary ranking={report.severity_ranking} />

      {/* 2×2 agent grid with staggered entrance */}
      <div className="agent-grid">
        <AgentCard
          icon="1"
          name="Agent 1 — UAE PII Detector"
          model={modelPill(pii.model)}
          color="var(--c4)"
          severity={pii.highest_severity}
          error={pii.error}
          findings={pii.findings.map((f) => ({
            text: `${f.pii_type} in ${f.location} — ${f.matched_text} (${f.severity})`,
            masked: true,
          }))}
        >
          <PIIBreakdown findings={pii.findings} />
          {pii.summary && pii.findings.length > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 10 }}>
              {pii.summary}
            </p>
          )}
        </AgentCard>

        <AgentCard
          icon="2"
          name="Agent 2 — Input/Output Validator"
          model={modelPill(injection.model)}
          color="var(--c6)"
          severity={injection.severity}
          error={injection.error}
          findings={
            injection.injection_detected
              ? [
                  `${injection.injection_type} — confidence ${(injection.confidence * 100).toFixed(0)}%`,
                  ...(injection.extracted_payload
                    ? [`Payload: "${injection.extracted_payload}"`]
                    : []),
                ]
              : []
          }
        >
          <ConfidenceGauge confidence={injection.confidence ?? 0} />
          {injection.rationale && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 10 }}>
              {injection.rationale}
            </p>
          )}
        </AgentCard>

        <AgentCard
          icon="3"
          name="Agent 3 — Framework Mapper"
          model={modelPill(framework.model)}
          color="var(--c1)"
          severity={framework.highest_severity}
          error={framework.error}
          findings={framework.mappings.map((m) => `${m.framework} ${m.reference} — ${m.severity}`)}
        />

        <AgentCard
          icon="4"
          name="Agent 4 — Report Generator"
          model={modelPill(report.model)}
          color="var(--c7)"
          severity={null}
          error={report.error}
          findings={report.report_id ? [`Report ${report.report_id} generated`] : []}
        />
      </div>

      {/* Framework mapping detail */}
      <FrameworkMap framework={framework} />

      {/* Digital Dubai AI Ethics — 2×2 assessment grid */}
      {ddAssessment && (
        <section>
          <h2 className="section-title">Digital Dubai AI Ethics</h2>
          <div className="dd-grid">
            {[
              { key: 'accountability', label: 'Accountability' },
              { key: 'transparency',   label: 'Transparency' },
              { key: 'fairness',       label: 'Fairness' },
              { key: 'explainability', label: 'Explainability' },
            ].map(({ key, label }) => (
              <div key={key} className="dd-card card fade-up">
                <div className="dd-card-head">
                  <span className="eyebrow">{label}</span>
                </div>
                <p className="dd-text">
                  {ddAssessment[key] || 'No assessment provided.'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Compliance report */}
      <section>
        <h2 className="section-title">Compliance Report</h2>
        <div className="report-panel card">
          <span className="eyebrow">Executive summary</span>
          <p style={{ marginTop: 8 }}>{report.executive_summary || 'No summary available.'}</p>

          {report.remediation_recommendations?.length > 0 && (
            <>
              <span className="eyebrow" style={{ display: 'block', marginTop: 20 }}>
                Remediation
              </span>
              <ol>
                {report.remediation_recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </>
          )}

          {report.report_id && !report.error && (
            <button className="download-btn" onClick={handleDownload}>
              <span aria-hidden="true">⬇</span> Download PDF report
            </button>
          )}
          {downloadError && (
            <div className="agent-error" role="alert" style={{ marginTop: 12 }}>{downloadError}</div>
          )}
        </div>
      </section>

      <AnalysisIdStrip analysisId={analysis_id} />
    </div>
  )
}
