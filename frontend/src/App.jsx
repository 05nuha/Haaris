import { useState } from 'react'
import Header from './components/Header.jsx'
import AnalysisPage from './pages/AnalysisPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'

export default function App() {
  const [page, setPage] = useState('analyze')

  return (
    <div className="container">
      <Header />
      <nav className="nav-tabs" aria-label="Pages">
        <button
          className={`nav-tab ${page === 'analyze' ? 'active' : ''}`}
          onClick={() => setPage('analyze')}
        >
          Analyze
        </button>
        <button
          className={`nav-tab ${page === 'history' ? 'active' : ''}`}
          onClick={() => setPage('history')}
        >
          History
        </button>
      </nav>

      {page === 'analyze' ? <AnalysisPage /> : <HistoryPage />}

      <footer className="site-footer">
        Haaris (حارس) — automated compliance analysis for UAE enterprises.
        Reports are an analysis aid, not legal advice.
      </footer>
    </div>
  )
}
