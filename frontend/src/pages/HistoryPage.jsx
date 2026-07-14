import { useEffect, useState } from 'react'
import ResultsView from '../components/ResultsView.jsx'
import { fetchHistory, fetchAnalysis } from '../api.js'

const FILTERS = ['ALL', 'COMPLIANT', 'REVIEW', 'NON-COMPLIANT']

/** Audit trail as master-detail: analysis list on the left, the full
    report view (same component as the Analyze page) on the right. */
export default function HistoryPage() {
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 })
  const [filter, setFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState({ loading: false, error: null, result: null })

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

  const select = async (analysisId) => {
    setSelectedId(analysisId)
    setDetail({ loading: true, error: null, result: null })
    try {
      const result = await fetchAnalysis(analysisId)
      setDetail({ loading: false, error: null, result })
    } catch {
      setDetail({
        loading: false,
        result: null,
        error: 'Could not load that analysis — it may predate the audit trail or MongoDB is unavailable.',
      })
    }
  }

  if (state.loading) {
    return (
      <div className="loading-panel card" role="status">
        <div className="loading-stage">
          <span className="spinner" aria-hidden="true" /> Loading audit trail…
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="state-panel card error" role="alert">
        <div className="state-icon" aria-hidden="true">⚠</div>
        <div className="state-title">Audit trail unavailable</div>
        <p className="state-body">{state.error}</p>
      </div>
    )
  }

  if (state.items.length === 0) {
    return (
      <div className="state-panel card">
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
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Audit Trail — {state.total} analyses
      </h2>

      <div className="filter-chips" role="group" aria-label="Filter by decision">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="history-layout">
        <div className="history-list card" role="listbox" aria-label="Past analyses">
          {visible.length === 0 && (
            <p className="history-list-empty">No analyses match this filter.</p>
          )}
          {visible.map((item) => (
            <button
              key={item.analysis_id}
              role="option"
              aria-selected={selectedId === item.analysis_id}
              className={`history-item ${selectedId === item.analysis_id ? 'selected' : ''}`}
              onClick={() => select(item.analysis_id)}
            >
              <span className="history-item-top">
                <span className={`decision-chip chip-${item.decision}`}>{item.decision}</span>
                <span className={`severity-badge sev-${item.highest_severity}`}>
                  {item.highest_severity}
                </span>
              </span>
              <span className="history-item-time">
                {new Date(item.created_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
              <span className="history-item-facts">
                {item.pii_findings_count > 0
                  ? `${item.pii_findings_count} PII finding${item.pii_findings_count > 1 ? 's' : ''}`
                  : 'no PII'}
                {' · '}
                {item.injection_detected ? 'injection' : 'no injection'}
              </span>
              <span className="hash-mono" title={item.input_hash}>
                {item.input_hash.slice(0, 16)}…
              </span>
            </button>
          ))}
          {state.total > state.items.length && (
            <p className="history-pagination-note">
              Showing {state.items.length} of {state.total}
            </p>
          )}
        </div>

        <div className="history-detail-pane">
          {!selectedId && (
            <div className="state-panel card">
              <div className="state-title">Select an analysis</div>
              <p className="state-body">
                Pick an entry from the list to review its verdict, findings, and report.
              </p>
            </div>
          )}
          {selectedId && detail.loading && (
            <div className="loading-panel card" role="status">
              <div className="loading-stage">
                <span className="spinner" aria-hidden="true" /> Loading analysis…
              </div>
            </div>
          )}
          {selectedId && detail.error && (
            <div className="state-panel card error" role="alert">
              <div className="state-title">Could not load analysis</div>
              <p className="state-body">{detail.error}</p>
            </div>
          )}
          {selectedId && detail.result && <ResultsView result={detail.result} />}
        </div>
      </div>
    </section>
  )
}
