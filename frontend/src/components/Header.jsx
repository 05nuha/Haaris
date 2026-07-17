import { ShieldIcon } from './Icons.jsx'

/** Top navigation bar — brand, page tabs, local-processing badge. */
export default function Header({ page, onNav }) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <ShieldIcon size={16} />
          </span>
          Haaris
          <span className="brand-ar" dir="rtl" aria-hidden="true">حارس</span>
        </div>

        <nav className="nav-tabs" aria-label="Pages">
          <button
            className={`nav-tab ${page === 'analyze' ? 'active' : ''}`}
            onClick={() => onNav('analyze')}
          >
            Analyze
          </button>
          <button
            className={`nav-tab ${page === 'history' ? 'active' : ''}`}
            onClick={() => onNav('history')}
          >
            History
          </button>
        </nav>

        <div className="navbar-right">
          <span
            className="local-badge"
            title="Emirates IDs and UAE-regulated PII are detected and masked by on-device regex before any cloud call."
          >
            <span className="dot" aria-hidden="true" />
            Local PII redaction
          </span>
        </div>
      </div>
    </header>
  )
}
