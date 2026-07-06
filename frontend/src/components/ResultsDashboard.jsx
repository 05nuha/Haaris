import { useEffect, useState } from 'react'
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
          stroke="rgba(255,255,255,0.07)"
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
          fontWeight="800"
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

const SEV_BAR_COLOR = {
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
                background: SEV_BAR_COLOR[severity] || 'var(--c1)',
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
// Main dashboard
// ---------------------------------------------------------------------------

export default function ResultsDashboard({ result }) {
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

      {/* Pipeline flow — four nodes showing each agent's outcome severity */}
      <PipelineFlow agents={agents} />

      {/* Decision badge with pulsing glow */}
      <div className={`decision-wrap decision-${decision}`}>
        <div className="decision-glow" aria-hidden="true" />
        <div className="decision-badge" role="status">{decision}</div>
        {decision_rationale && <p className="decision-rationale">{decision_rationale}</p>}
      </div>

      {/* 2×2 agent grid with staggered entrance */}
      <div className="agent-grid">
        <AgentCard
          icon="🛡"
          name="Agent 1 — UAE PII Detector"
          model={modelPill(pii.model)}
          color="var(--c4)"
          severity={pii.highest_severity}
          error={pii.error}
          findings={pii.findings.map(
            (f) => `${f.pii_type} in ${f.location} — ${f.matched_text} (${f.severity})`,
          )}
        >
          <PIIBreakdown findings={pii.findings} />
          {pii.summary && pii.findings.length > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 10 }}>
              {pii.summary}
            </p>
          )}
        </AgentCard>

        <AgentCard
          icon="⚔"
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
          icon="🗺"
          name="Agent 3 — Framework Mapper"
          model={modelPill(framework.model)}
          color="var(--c1)"
          severity={framework.highest_severity}
          error={framework.error}
          findings={framework.mappings.map((m) => `${m.framework} ${m.reference} — ${m.severity}`)}
        />

        <AgentCard
          icon="📋"
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
              { key: 'accountability', label: 'Accountability', icon: '⊛' },
              { key: 'transparency',   label: 'Transparency',   icon: '◈' },
              { key: 'fairness',       label: 'Fairness',       icon: '⊜' },
              { key: 'explainability', label: 'Explainability', icon: '◎' },
            ].map(({ key, label, icon }) => (
              <div key={key} className="dd-card glass fade-up">
                <div className="dd-card-head">
                  <span className="dd-icon" aria-hidden="true">{icon}</span>
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
        <div className="report-panel glass-2">
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
            <div className="agent-error" style={{ marginTop: 12 }}>{downloadError}</div>
          )}
        </div>
      </section>
    </div>
  )
}
