/** One agent result card — accent bar, model pill, animated checkmark,
    findings list, and severity badge. */

const SeverityBadge = ({ level }) =>
  level ? <span className={`severity-badge sev-${level}`}>{level}</span> : null

const Check = ({ ok }) =>
  ok ? (
    <svg className="check" viewBox="0 0 26 26" aria-label="Complete">
      <circle cx="13" cy="13" r="12" stroke="var(--c4)" />
      <path d="M7.5 13.5l3.5 3.5 7-8" stroke="var(--c4)" />
    </svg>
  ) : (
    <svg className="check" viewBox="0 0 26 26" aria-label="Error">
      <circle cx="13" cy="13" r="12" stroke="var(--c5)" />
      <path d="M9 9l8 8M17 9l-8 8" stroke="var(--c5)" />
    </svg>
  )

export default function AgentCard({ icon, name, model, color, severity, findings, error, children }) {
  return (
    <article className="agent-card glass gradient-border-hover">
      <span className="accent-bar" style={{ background: color }} aria-hidden="true" />
      <div className="agent-head">
        <div className="agent-identity">
          <div className="agent-icon" aria-hidden="true">{icon}</div>
          <div>
            <div className="agent-name">{name}</div>
            <span className="model-pill">{model}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SeverityBadge level={severity} />
          <Check ok={!error} />
        </div>
      </div>

      {findings && findings.length > 0 ? (
        <ul className="findings-list">
          {findings.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : !error ? (
        <p className="findings-empty">No findings — clean.</p>
      ) : null}

      {children}
      {error && <div className="agent-error">Agent error: {error}</div>}
    </article>
  )
}
