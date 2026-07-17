/** Four-agent pipeline flow — horizontal node chain showing each agent's outcome. */

import { ShieldIcon, ZapIcon, LayersIcon, FileIcon, ArrowRightIcon } from './Icons.jsx'

const SEV_COLOR = {
  Critical: 'var(--c5)',
  High:     'var(--c8)',
  Medium:   'var(--c3)',
  Low:      'var(--c6)',
  None:     'var(--c4)',
}

const SEV_TEXT = {
  Critical: 'var(--red-text)',
  High:     'var(--orange-text)',
  Medium:   'var(--amber-text)',
  Low:      'var(--blue-text)',
  None:     'var(--green-text)',
}

const STAGES = [
  { Icon: ShieldIcon, label: 'PII Detector' },
  { Icon: ZapIcon,    label: 'Validator' },
  { Icon: LayersIcon, label: 'Frameworks' },
  { Icon: FileIcon,   label: 'Report' },
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
      {STAGES.map(({ Icon, label }, i) => {
        const sev = severities[i]
        return (
          <div key={i} className="pipeline-stage-wrap" role="listitem">
            <div className="pipeline-node" style={{ '--node-color': SEV_COLOR[sev] }}>
              <div className="pipeline-node-icon" aria-hidden="true">
                <Icon size={16} />
              </div>
              <div className="pipeline-node-label">{label}</div>
              <span className="pipeline-node-sev" style={{ color: SEV_TEXT[sev] }}>
                {sev === 'None' ? 'Clean' : sev}
              </span>
            </div>

            {i < STAGES.length - 1 && (
              <div className="pipeline-connector" aria-hidden="true">
                <ArrowRightIcon size={16} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
