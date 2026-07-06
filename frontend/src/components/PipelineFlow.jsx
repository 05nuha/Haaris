/** Four-agent pipeline flow — horizontal node chain showing each agent's outcome. */

const SEV_COLOR = {
  Critical: 'var(--c5)',
  High:     'var(--c8)',
  Medium:   'var(--c3)',
  Low:      'var(--c6)',
  None:     'var(--c4)',
}

const STAGES = [
  { icon: '🛡', label: 'PII Detector', agentColor: 'var(--c4)' },
  { icon: '⚔',  label: 'Validator',    agentColor: 'var(--c6)' },
  { icon: '🗺', label: 'Frameworks',   agentColor: 'var(--c1)' },
  { icon: '📋', label: 'Report',       agentColor: 'var(--c7)' },
]

export default function PipelineFlow({ agents }) {
  const { pii, injection, framework, report } = agents

  const severities = [
    pii.status       === 'error' ? 'Critical' : (pii.highest_severity       || 'None'),
    injection.status === 'error' ? 'Critical' : (injection.severity         || 'None'),
    framework.status === 'error' ? 'Critical' : (framework.highest_severity || 'None'),
    report.status    === 'error' ? 'Critical' : 'None',
  ]

  return (
    <div className="pipeline-flow" role="list" aria-label="Agent pipeline">
      {STAGES.map((stage, i) => {
        const sevColor = SEV_COLOR[severities[i]] || 'var(--c4)'
        return (
          <div key={i} className="pipeline-stage-wrap" role="listitem">
            <div
              className="pipeline-node"
              style={{ '--node-color': sevColor, '--agent-color': stage.agentColor }}
            >
              <div className="pipeline-node-icon" aria-hidden="true">{stage.icon}</div>
              <div className="pipeline-node-label">{stage.label}</div>
              {severities[i] !== 'None' && (
                <span className="pipeline-node-sev" style={{ color: sevColor }}>
                  {severities[i]}
                </span>
              )}
            </div>

            {i < STAGES.length - 1 && (
              <div className="pipeline-connector" aria-hidden="true">
                <svg width="36" height="12" viewBox="0 0 36 12" fill="none">
                  <line x1="0" y1="6" x2="27" y2="6" stroke="var(--stroke)" strokeWidth="1.5" />
                  <path
                    d="M23 2l6 4-6 4"
                    stroke="var(--stroke)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
