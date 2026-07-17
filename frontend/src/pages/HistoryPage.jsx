import { Fragment, useEffect, useState } from 'react'
import { fetchHistory, fetchAnalysis } from '../api.js'
import { ArchiveIcon, AlertTriangleIcon } from '../components/Icons.jsx'

const FILTERS = ['ALL', 'COMPLIANT', 'REVIEW', 'NON-COMPLIANT']

// Short labels for the expanded-row injection type.
const SHORT_INJECTION = {
  'Direct Prompt Injection': 'Direct',
  'Indirect Prompt Injection': 'Indirect',
  'Jailbreak Attempt': 'Jailbreak',
  'Goal Hijacking': 'Goal Hijacking',
  'Prompt Leaking': 'Prompt Leak',
  'None Detected': '—',
}

export default function HistoryPage({ onView }) {
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 })
  const [viewError, setViewError] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [expandedId, setExpandedId] = useState(null)
  // analysis_id → full AnalysisResult (lazy-loaded when a row expands)
  const [details, setDetails] = useState({})

  useEffect(() => {
    let live = true
    fetchHistory()
      .then((data) => live && setState({ loading: false, error: null, items: data.items, total: data.total }))
      .catch((err) =>
        live &&
        setState({
          loading: false,
          items: [],
          total: 0,
          error:
            err.code === 'ERR_NETWORK'
              ? 'Backend unreachable — start the FastAPI server on localhost:8000 to see the audit trail.'
              : 'Could not load the audit trail. Check the backend logs.',
        }),
      )
    return () => { live = false }
  }, [])

  const view = async (analysisId) => {
    setViewError(null)
    try {
      const full = details[analysisId] ?? (await fetchAnalysis(analysisId))
      onView(full)
    } catch {
      setViewError('Could not load that analysis — it may predate the audit trail or MongoDB is unavailable.')
    }
  }

  const toggleExpand = async (analysisId) => {
    if (expandedId === analysisId) {
      setExpandedId(null)
      return
    }
    setExpandedId(analysisId)
    if (!details[analysisId]) {
      try {
        const full = await fetchAnalysis(analysisId)
        setDetails((d) => ({ ...d, [analysisId]: full }))
      } catch {
        setDetails((d) => ({ ...d, [analysisId]: { _error: true } }))
      }
    }
  }

  if (state.loading) {
    return (
      <div className="loading-panel glass" role="status">
        <div className="loading-stage">
          <span className="spinner" aria-hidden="true" /> Loading audit trail…
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="state-panel glass error" role="alert">
        <div className="state-icon" aria-hidden="true"><AlertTriangleIcon size={22} /></div>
        <div className="state-title">Audit trail unavailable</div>
        <p className="state-body">{state.error}</p>
      </div>
    )
  }

  if (state.items.length === 0) {
    return (
      <div className="state-panel glass">
        <div className="state-icon" aria-hidden="true"><ArchiveIcon size={22} /></div>
        <div className="state-title">No analyses yet</div>
        <p className="state-body">
          Every analysis is stored here with a timestamp and input hash for the PDPL
          audit trail. Run your first analysis to start the record.
        </p>
      </div>
    )
  }

  const visible =
    filter === 'ALL' ? state.items : state.items.filter((i) => i.decision === filter)

  return (
    <section className="fade-up">
      <div className="page-head">
        <h1>Audit Trail</h1>
        <p className="page-sub">
          {state.total} {state.total === 1 ? 'analysis' : 'analyses'} recorded with timestamps
          and input hashes for the PDPL audit requirement.
        </p>
      </div>

      <div className="filter-chips" role="group" aria-label="Filter by decision">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-chip ${f !== 'ALL' ? `filter-${f}` : ''} ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </div>

      {viewError && <div className="agent-error" role="alert" style={{ marginBottom: 14 }}>{viewError}</div>}

      <div className="history-table-wrap glass">
        <table className="history-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Decision</th>
              <th>PII</th>
              <th>Injection</th>
              <th>Severity</th>
              <th>Input hash</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const expanded = expandedId === item.analysis_id
              const detail = details[item.analysis_id]
              return (
                <Fragment key={item.analysis_id}>
                  <tr
                    className={`history-row ${expanded ? 'expanded' : ''}`}
                    onClick={() => toggleExpand(item.analysis_id)}
                    aria-expanded={expanded}
                  >
                    <td>
                      {new Date(item.created_at).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td><span className={`decision-chip chip-${item.decision}`}>{item.decision}</span></td>
                    <td>{item.pii_findings_count > 0 ? `${item.pii_findings_count} finding${item.pii_findings_count > 1 ? 's' : ''}` : '—'}</td>
                    <td>{item.injection_detected ? 'Detected' : '—'}</td>
                    <td><span className={`severity-badge sev-${item.highest_severity}`}>{item.highest_severity}</span></td>
                    <td className="hash-mono" title={item.input_hash}>{item.input_hash.slice(0, 12)}…</td>
                    <td>
                      <button
                        className="reviewbtn"
                        onClick={(e) => { e.stopPropagation(); view(item.analysis_id) }}
                      >
                        Re-view
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="history-detail-row">
                      <td colSpan={7}>
                        {!detail ? (
                          <div className="history-detail loading">
                            <span className="spinner" aria-hidden="true" /> Loading details…
                          </div>
                        ) : detail._error ? (
                          <div className="history-detail">
                            Could not load details for this analysis.
                          </div>
                        ) : (
                          <div className="history-detail">
                            <p className="history-detail-rationale">
                              {detail.decision_rationale || 'No rationale recorded.'}
                            </p>
                            <div className="history-detail-facts">
                              <span>
                                <strong>PII:</strong>{' '}
                                {detail.agents.pii.findings.length > 0
                                  ? detail.agents.pii.summary
                                  : 'none detected'}
                              </span>
                              <span>
                                <strong>Injection:</strong>{' '}
                                {detail.agents.injection.injection_detected
                                  ? `${SHORT_INJECTION[detail.agents.injection.injection_type] ?? detail.agents.injection.injection_type} (${Math.round(detail.agents.injection.confidence * 100)}%)`
                                  : 'none detected'}
                              </span>
                              <span>
                                <strong>Framework mappings:</strong>{' '}
                                {detail.agents.framework.mappings.length || 'none'}
                              </span>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {state.total > state.items.length && (
        <p className="history-pagination-note">
          Showing {state.items.length} of {state.total}
        </p>
      )}
    </section>
  )
}
