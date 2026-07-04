/** Framework mapping section — colored framework pills + mapping cards. */

const FRAMEWORK_STYLE = [
  { match: 'PDPL', color: 'var(--c2)', icon: '⚖' },
  { match: 'OWASP', color: 'var(--c3)', icon: '⬢' },
  { match: 'MITRE', color: 'var(--c6)', icon: '◈' },
  { match: 'Digital Dubai', color: 'var(--c4)', icon: '◎' },
  { match: 'National AI', color: 'var(--c7)', icon: '▣' },
]

const styleFor = (name) =>
  FRAMEWORK_STYLE.find((f) => name.toLowerCase().includes(f.match.toLowerCase())) ??
  { color: 'var(--c1)', icon: '◇' }

export default function FrameworkMap({ framework }) {
  const { mappings = [], summary, pdpl_violation } = framework
  const uniqueFrameworks = [...new Set(mappings.map((m) => m.framework))]

  return (
    <section>
      <h2 className="section-title">Framework Mapping</h2>

      {mappings.length === 0 ? (
        <div className="state-panel glass">
          <div className="state-icon" aria-hidden="true">✓</div>
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
                <span
                  key={name}
                  className="framework-pill"
                  style={{
                    color: s.color,
                    borderColor: `color-mix(in srgb, ${s.color} 50%, transparent)`,
                    background: 'var(--panel)',
                  }}
                >
                  <span aria-hidden="true">{s.icon}</span> {name}
                </span>
              )
            })}
            {pdpl_violation && (
              <span className="framework-pill" style={{ color: 'var(--c5)', borderColor: 'rgba(232,138,138,0.5)', background: 'rgba(232,138,138,0.07)' }}>
                ⚠ PDPL violation identified
              </span>
            )}
          </div>

          {summary && (
            <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: 16 }}>{summary}</p>
          )}

          {mappings.map((m, i) => {
            const s = styleFor(m.framework)
            return (
              <div className="mapping-card glass fade-up" style={{ animationDelay: `${0.08 * i}s` }} key={i}>
                <span className="mapping-ref" style={{ color: s.color }}>
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
