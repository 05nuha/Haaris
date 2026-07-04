import { useEffect, useState } from 'react'

const STAGES = [
  { at: 0, pct: 20, label: 'Agents 1 & 2 scanning in parallel — local PII regex + injection classification…' },
  { at: 2, pct: 55, label: 'Agent 3 mapping findings to PDPL, OWASP, MITRE ATLAS…' },
  { at: 4, pct: 80, label: 'Agent 4 drafting the compliance report…' },
  { at: 7, pct: 92, label: 'Finalizing PDF and audit record…' },
]

/** Loading state: staged progress bar + shimmering skeleton agent cards. */
export default function SkeletonLoader() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const stage = [...STAGES].reverse().find((s) => elapsed >= s.at) ?? STAGES[0]

  return (
    <div className="loading-panel glass fade-up" role="status" aria-live="polite">
      <div className="loading-stage">
        <span className="spinner" aria-hidden="true" />
        {stage.label}
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${stage.pct}%` }} />
      </div>
      <div className="skeleton-grid" aria-hidden="true">
        <div className="skeleton-card" />
        <div className="skeleton-card" style={{ animationDelay: '0.15s' }} />
        <div className="skeleton-card" style={{ animationDelay: '0.3s' }} />
        <div className="skeleton-card" style={{ animationDelay: '0.45s' }} />
      </div>
    </div>
  )
}
