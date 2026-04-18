import { useState } from 'react'
import TriggerPanel from './components/TriggerPanel'
import RunsTable    from './components/RunsTable'
import StatsPanel   from './components/StatsPanel'

type TabId = 'run' | 'signals' | 'stats'

const IconRun = () => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 3.5a.5.5 0 0 1 .776-.416l7 4.5a.5.5 0 0 1 0 .832l-7 4.5A.5.5 0 0 1 4 12.5v-9z"/>
  </svg>
)
const IconSignals = () => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 2.5zm0 4A.5.5 0 0 1 2.5 6h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 6.5zm0 4A.5.5 0 0 1 2.5 10h6a.5.5 0 0 1 0 1h-6A.5.5 0 0 1 2 10.5z"/>
  </svg>
)
const IconStats = () => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 11h3v3H1v-3zm4-5h3v8H5V6zm4-4h3v12H9V2zm4 7h-1v5h1V9z"/>
  </svg>
)

const TABS: { id: TabId; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'run',     label: 'Run',     desc: 'Configure and trigger strategies', icon: <IconRun /> },
  { id: 'signals', label: 'Signals', desc: 'Live trade signal feed',            icon: <IconSignals /> },
  { id: 'stats',   label: 'Stats',   desc: 'Performance analytics',             icon: <IconStats /> },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('run')
  const current = TABS.find(t => t.id === tab)!

  return (
    <div className="min-h-screen flex bg-zinc-950">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-zinc-800/80 bg-zinc-950">

        {/* Logo */}
        <div className="px-4 h-14 flex items-center gap-3 border-b border-zinc-800/80">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-black" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8zm7-6a6 6 0 0 0 0 12A6 6 0 0 0 8 2zm.5 3.5v3.25l2.5 1.5-.75 1.25L7.5 9.5V5.5h1z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 leading-tight truncate">Polymarket Bot</p>
            <p className="text-[10px] text-zinc-600 leading-tight">Strategy Dashboard</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`nav-item ${tab === t.id ? 'nav-item-active' : 'nav-item-inactive'}`}
            >
              <span className={tab === t.id ? 'text-emerald-400' : 'text-zinc-600'}>
                {t.icon}
              </span>
              {t.label}
              {tab === t.id && (
                <span className="ml-auto w-1 h-1 rounded-full bg-emerald-500" />
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="status-dot bg-zinc-700" />
            <span className="text-[11px] text-zinc-600">Firebase · Realtime</span>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Page header */}
        <header className="h-14 px-6 flex items-center justify-between border-b border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-zinc-600">{current.icon}</span>
            <div>
              <h1 className="text-sm font-semibold text-zinc-100">{current.label}</h1>
              <p className="text-[11px] text-zinc-600">{current.desc}</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {tab === 'run'     && <TriggerPanel />}
          {tab === 'signals' && <RunsTable />}
          {tab === 'stats'   && <StatsPanel />}
        </main>
      </div>

    </div>
  )
}
