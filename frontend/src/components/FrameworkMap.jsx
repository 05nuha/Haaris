/** Framework mapping section — framework pills + mapping cards. */

export default function FrameworkMap({ framework }) {
  const { mappings = [], summary, pdpl_violation } = framework
  const uniqueFrameworks = [...new Set(mappings.map((m) => m.framework))]

  return (
    <section>
      <h2 className="section-title">Framework Mapping</h2>

      {mappings.length === 0 ? (
        <div className="state-panel card">
          <div className="state-icon" aria-hidden="true">✓</div>
          <div className="state-title">No framework violations</div>
          <p className="state-body">
            {summary || 'Upstream detectors returned clean — nothing to map against UAE or international frameworks.'}
          </p>
        </div>
      ) : (
        <>
          <div className="framework-badges">
            {uniqueFrameworks.map((name) => (
              <span key={name} className="framework-pill">{name}</span>
            ))}
            {pdpl_violation && (
              <span className="framework-pill warning">PDPL violation identified</span>
            )}
          </div>

          {summary && (
            <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: 16 }}>{summary}</p>
          )}

          {mappings.map((m, i) => {
            return (
              <div className="mapping-card card fade-up" style={{ animationDelay: `${0.08 * i}s` }} key={i}>
                <span className="mapping-ref">
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
