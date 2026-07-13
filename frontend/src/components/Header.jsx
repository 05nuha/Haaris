/** Site header — plain wordmark, subtitle, and the local-detection note. */
export default function Header() {
  return (
    <header className="site-header">
      <h1 className="site-title">
        Haaris <span className="arabic" dir="rtl">حارس</span>
      </h1>
      <p className="site-subtitle">UAE LLM Compliance Guardrail</p>
      <div className="local-badge">
        <span className="dot" aria-hidden="true" />
        Local PII detection — Emirates IDs caught by on-device regex before any cloud call
      </div>
    </header>
  )
}
