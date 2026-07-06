import { useEffect, useState } from 'react'

// Sequential pipeline stages (Agent 1 runs first and redacts PII before
// anything is sent to the cloud — the labels reflect the real order).
const STEPS = [
  { at: 0, pct: 25, icon: '🛡', label: 'Agent 1 — Scanning for UAE-regulated PII…' },
  { at: 2, pct: 55, icon: '⚔', label: 'Agent 2 — Classifying prompt injection patterns…' },
  { at: 4, pct: 80, icon: '🗺', label: 'Agent 3 — Mapping to PDPL, OWASP, MITRE ATLAS…' },
  { at: 7, pct: 93, icon: '📋', label: 'Agent 4 — Drafting compliance report…' },
]

const StepCheck = () => (
  <svg className="step-check" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M5 10.5l3.5 3.5 6.5-8" fill="none" stroke="var(--c4)" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Loading state: progress bar + per-step pipeline status list. */
export default function SkeletonLoader() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const activeIdx = STEPS.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0)
  const pct = STEPS[activeIdx].pct

  return (
    <div className="loading-panel glass fade-up" role="status" aria-live="polite">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <ol className="pipeline-steps">
        {STEPS.map((step, i) => {
          const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
          return (
            <li key={i} className={`pipeline-step step-${state}`}>
              <span className="step-icon" aria-hidden="true">{step.icon}</span>
              <span className="step-label">{step.label}</span>
              <span className="step-status">
                {state === 'done' && <StepCheck />}
                {state === 'active' && <span className="spinner" aria-hidden="true" />}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
