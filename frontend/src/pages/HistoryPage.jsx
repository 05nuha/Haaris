import { useEffect, useState } from 'react'
import { fetchHistory, fetchAnalysis } from '../api.js'

export default function HistoryPage({ onView }) {
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 })
  const [viewError, setViewError] = useState(null)

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
      const full = await fetchAnalysis(analysisId)
      onView(full)
    } catch {
      setViewError('Could not load that analysis — it may predate the audit trail or MongoDB is unavailable.')
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
      <div className="state-panel glass error">
        <div className="state-icon" aria-hidden="true">⚠</div>
        <div className="state-title">Audit trail unavailable</div>
        <p className="state-body">{state.error}</p>
      </div>
    )
  }

  if (state.items.length === 0) {
    return (
      <div className="state-panel glass">
        <div className="state-icon" aria-hidden="true">🗂</div>
        <div className="state-title">No analyses yet</div>
        <p className="state-body">
          Every analysis is stored here with a timestamp and input hash for the PDPL
          audit trail. Run your first analysis to start the record.
        </p>
      </div>
    )
  }

  return (
    <section className="fade-up">
      <h2 className="section-title">Audit Trail — {state.total} analyses</h2>
      {viewError && <div className="agent-error" style={{ marginBottom: 14 }}>{viewError}</div>}
      <div className="history-table-wrap glass">
        <table className="history-table">
          <thead>
            <tr>
              <th>Timestamp (UTC)</th>
              <th>Decision</th>
              <th>PII</th>
              <th>Injection</th>
              <th>Severity</th>
              <th>Input hash</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((item) => (
              <tr key={item.analysis_id}>
                <td>{new Date(item.created_at).toLocaleString('en-GB', { timeZone: 'UTC' })}</td>
                <td><span className={`decision-chip chip-${item.decision}`}>{item.decision}</span></td>
                <td>{item.pii_findings_count > 0 ? `${item.pii_findings_count} finding${item.pii_findings_count > 1 ? 's' : ''}` : '—'}</td>
                <td>{item.injection_detected ? 'Detected' : '—'}</td>
                <td><span className={`severity-badge sev-${item.highest_severity}`}>{item.highest_severity}</span></td>
                <td className="hash-mono" title={item.input_hash}>{item.input_hash.slice(0, 12)}…</td>
                <td>
                  <button className="reviewbtn" onClick={() => view(item.analysis_id)}>
                    Re-view
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
