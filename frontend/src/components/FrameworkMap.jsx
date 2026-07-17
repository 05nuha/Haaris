/** Framework mapping section — framework pills with colored dots + mapping cards. */

import { CheckCircleIcon, AlertTriangleIcon } from './Icons.jsx'

const FRAMEWORK_STYLE = [
  { match: 'PDPL',          color: 'var(--c3)', text: 'var(--amber-text)' },
  { match: 'OWASP',         color: 'var(--c6)', text: 'var(--blue-text)' },
  { match: 'MITRE',         color: 'var(--c5)', text: 'var(--red-text)' },
  { match: 'Digital Dubai', color: 'var(--c4)', text: 'var(--green-text)' },
  { match: 'National AI',   color: 'var(--c7)', text: 'var(--violet-text)' },
]

const styleFor = (name) =>
  FRAMEWORK_STYLE.find((f) => name.toLowerCase().includes(f.match.toLowerCase())) ??
  { color: 'var(--c1)', text: 'var(--blue-text)' }

export default function FrameworkMap({ framework }) {
  const { mappings = [], summary, pdpl_violation } = framework
  const uniqueFrameworks = [...new Set(mappings.map((m) => m.framework))]

  return (
    <section>
      <h2 className="section-title">Framework Mapping</h2>

      {mappings.length === 0 ? (
        <div className="state-panel glass">
          <div className="state-icon" aria-hidden="true" style={{ color: 'var(--c4)' }}>
            <CheckCircleIcon size={22} />
          </div>
          <div className="state-title">No framework violations</div>
          <p className="state-body">
            {summary || 'Upstream detectors returned clean — nothing to map against UAE or international frameworks.'}
          </p>
        </div>
      ) : (
        <>
          <div className="framework-badges">
            {uniqueFrameworks.map((name) => {
              const s = styleFor(name)
              return (
                <span key={name} className="framework-pill" style={{ color: s.text }}>
                  <span className="pill-dot" style={{ background: s.color }} aria-hidden="true" />
                  {name}
                </span>
              )
            })}
            {pdpl_violation && (
              <span
                className="framework-pill"
                style={{
                  color: 'var(--red-text)',
                  borderColor: 'var(--red-border)',
                  background: 'var(--red-bg)',
                  gap: 6,
                }}
              >
                <AlertTriangleIcon size={13} /> PDPL violation identified
              </span>
            )}
          </div>

          {summary && (
            <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginBottom: 14 }}>{summary}</p>
          )}

          {mappings.map((m, i) => {
            const s = styleFor(m.framework)
            return (
              <div className="mapping-card glass" key={i}>
                <span className="mapping-ref" style={{ color: s.text }}>
                  {m.framework} · {m.reference}
                </span>
                <span className="mapping-violation">{m.violation}</span>
                <span className={`severity-badge sev-${m.severity}`}>{m.severity}</span>
                {m.remediation && (
                  <span className="mapping-remediation">
                    <strong>Remediation:</strong> {m.remediation}
                  </span>
                )}
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
