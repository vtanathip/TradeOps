import { useState } from 'react'
import TriggerPanel from './components/TriggerPanel'
import RunsTable    from './components/RunsTable'
import StatsPanel   from './components/StatsPanel'

const TABS = [
  { id: 'run',     label: '▶  Run'     },
  { id: 'signals', label: '📋  Signals' },
  { id: 'stats',   label: '📊  Stats'   },
]

export default function App() {
  const [tab, setTab] = useState('run')

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <span className="text-2xl">📈</span>
        <div>
          <h1 className="text-lg font-bold text-white leading-tight">Polymarket Bot</h1>
          <p className="text-xs text-gray-500">Strategy Dashboard</p>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-gray-800 px-6 flex gap-1 pt-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-gray-900 text-white border border-b-0 border-gray-800'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 p-6">
        {tab === 'run'     && <TriggerPanel />}
        {tab === 'signals' && <RunsTable />}
        {tab === 'stats'   && <StatsPanel />}
      </main>
    </div>
  )
}
