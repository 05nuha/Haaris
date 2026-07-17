/** One agent result card — accent bar, model pill, status mark,
    findings list (with optional masked-value tooltips), and severity badge.

    `icon` is a rendered element (SVG). `findings` items may be plain
    strings, or objects: { text: '…', masked: true } → renders an ⓘ
    tooltip explaining masking. */

const MASK_NOTE =
  'Value masked — raw identifiers are never stored or sent to cloud APIs.'

const SeverityBadge = ({ level }) =>
  level ? <span className={`severity-badge sev-${level}`}>{level}</span> : null

const Check = ({ ok }) =>
  ok ? (
    <svg className="check" viewBox="0 0 26 26" aria-label="Complete">
      <circle cx="13" cy="13" r="11" stroke="var(--c4)" />
      <path d="M8 13.5l3.5 3.5 6.5-8" stroke="var(--c4)" />
    </svg>
  ) : (
    <svg className="check" viewBox="0 0 26 26" aria-label="Error">
      <circle cx="13" cy="13" r="11" stroke="var(--c5)" />
      <path d="M9.5 9.5l7 7M16.5 9.5l-7 7" stroke="var(--c5)" />
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
          {findings.map((f, i) => {
            const text = typeof f === 'string' ? f : f.text
            const masked = typeof f === 'object' && f.masked
            return (
              <li key={i}>
                <span>
                  {text}
                  {masked && (
                    <span
                      className="mask-info"
                      tabIndex={0}
                      role="note"
                      aria-label={MASK_NOTE}
                      data-tip={MASK_NOTE}
                    >
                      ⓘ
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      ) : !error ? (
        <p className="findings-empty">No findings — clean.</p>
      ) : null}

      {children}
      {error && <div className="agent-error" role="alert">Agent error: {error}</div>}
    </article>
  )
}
