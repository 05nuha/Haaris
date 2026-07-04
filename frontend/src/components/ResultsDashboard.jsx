import AgentCard from './AgentCard.jsx'
import FrameworkMap from './FrameworkMap.jsx'
import { downloadReport } from '../api.js'
import { useState } from 'react'

/** Full results view: decision badge, 2×2 agent grid, framework map, report. */
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
    return m // e.g. Agent 1: "regex (deterministic)"
  }

  return (
    <div className="results">
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
          {pii.summary && pii.findings.length > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 10 }}>{pii.summary}</p>
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
                  ...(injection.extracted_payload ? [`Payload: “${injection.extracted_payload}”`] : []),
                ]
              : []
          }
        >
          {injection.rationale && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 10 }}>{injection.rationale}</p>
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
          {downloadError && <div className="agent-error" style={{ marginTop: 12 }}>{downloadError}</div>}
        </div>
      </section>
    </div>
  )
}
