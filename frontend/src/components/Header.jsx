import { useEffect, useState } from 'react'

const FULL = 'Haaris'

/** Site header with a one-time typing animation on the wordmark. */
export default function Header() {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [typed, setTyped] = useState(reduced ? FULL : '')
  const done = typed.length === FULL.length

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setTyped(FULL.slice(0, typed.length + 1)), 130)
    return () => clearTimeout(t)
  }, [typed, done])

  return (
    <header className="site-header">
      <h1 className="site-title" aria-label="Haaris | حارس">
        <span className="gradient-text">{typed}</span>
        {done ? (
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
            {' '}| <span className="gradient-text" dir="rtl">حارس</span>
          </span>
        ) : (
          <span className="cursor" aria-hidden="true" />
        )}
      </h1>
      <p
        className="site-subtitle"
        style={{ opacity: done ? 1 : 0, transition: 'opacity 0.6s ease' }}
      >
        UAE LLM Compliance Guardrail
      </p>
      <div
        className="local-badge"
        style={{ opacity: done ? 1 : 0, transition: 'opacity 0.6s ease 0.15s' }}
      >
        <span className="dot" aria-hidden="true" />
        Local PII detection — Emirates IDs caught by on-device regex before any cloud call
      </div>
    </header>
  )
}
