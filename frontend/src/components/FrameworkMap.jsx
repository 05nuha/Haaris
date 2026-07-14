/** Framework mapping — pills + mapping cards. Rendered inside the
    evidence tabs, so it carries no section chrome of its own. */

export default function FrameworkMap({ framework }) {
  const { mappings = [], summary, pdpl_violation } = framework

  if (mappings.length === 0) {
    return (
      <div className="tab-empty">
        <div className="state-title">No framework violations</div>
        <p className="state-body">
          {summary || 'Upstream detectors returned clean — nothing to map against UAE or international frameworks.'}
        </p>
      </div>
    )
  }

  const uniqueFrameworks = [...new Set(mappings.map((m) => m.framework))]

  return (
    <div>
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

      {mappings.map((m, i) => (
        <div className="mapping-card" key={i}>
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
      ))}
    </div>
  )
}
