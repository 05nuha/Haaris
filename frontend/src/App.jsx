import { useState } from 'react'
import Header from './components/Header.jsx'
import AnalysisPage from './pages/AnalysisPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'

export default function App() {
  const [page, setPage] = useState('analyze')
  // A past analysis loaded from History via "Re-view".
  const [loadedResult, setLoadedResult] = useState(null)

  const openAnalysis = (result) => {
    setLoadedResult(result)
    setPage('analyze')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div className="container">
        <Header />
        <nav className="nav-tabs" aria-label="Pages">
          <button
            className={`nav-tab ${page === 'analyze' ? 'active' : ''}`}
            onClick={() => { setPage('analyze') }}
          >
            Analyze
          </button>
          <button
            className={`nav-tab ${page === 'history' ? 'active' : ''}`}
            onClick={() => { setLoadedResult(null); setPage('history') }}
          >
            History
          </button>
        </nav>

        {page === 'analyze' ? (
          <AnalysisPage
            loadedResult={loadedResult}
            clearLoaded={() => setLoadedResult(null)}
          />
        ) : (
          <HistoryPage onView={openAnalysis} />
        )}

        <footer className="site-footer">
          Haaris (حارس) — automated compliance analysis for UAE enterprises.
          Reports are an analysis aid, not legal advice.
        </footer>
      </div>
    </>
  )
}
