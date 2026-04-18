import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'

type ActionType = 'BUY_YES' | 'BUY_NO' | 'HOLD' | 'SKIP'

interface Signal {
  id:             string;
  run_timestamp?: { toDate: () => Date };
  question?:      string;
  condition_id?:  string;
  strategy?:      string;
  action?:        ActionType;
  yes_price?:     number;
  price?:         number;
  size_usd?:      number;
  edge?:          number;
  reason?:        string;
}

const ACTION_CONFIG: Record<ActionType, { dot: string; text: string; label: string }> = {
  BUY_YES: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'BUY YES' },
  BUY_NO:  { dot: 'bg-red-400',     text: 'text-red-400',     label: 'BUY NO'  },
  HOLD:    { dot: 'bg-amber-400',   text: 'text-amber-400',   label: 'HOLD'    },
  SKIP:    { dot: 'bg-zinc-600',    text: 'text-zinc-500',    label: 'SKIP'    },
}

const PAGE_SIZE = 50

export default function RunsTable() {
  const [signals,  setSignals]  = useState<Signal[]>([])
  const [strategy, setStrategy] = useState('all')
  const [action,   setAction]   = useState('all')
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    const q = query(collection(db, 'signals'), orderBy('run_timestamp', 'desc'), limit(500))
    return onSnapshot(q, snap => {
      setSignals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Signal)))
    })
  }, [])

  const strategies = ['all', ...new Set(signals.map(s => s.strategy).filter(Boolean))] as string[]
  const actions    = ['all', 'BUY_YES', 'BUY_NO', 'HOLD', 'SKIP']

  const filtered = signals.filter(s => {
    if (strategy !== 'all' && s.strategy !== strategy) return false
    if (action   !== 'all' && s.action   !== action)   return false
    if (search && !s.question?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-4">

      {/* Filters */}
      <div className="surface p-3 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none"
            viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.656a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/>
          </svg>
          <input
            className="input pl-8 text-xs"
            placeholder="Search market question…"
            aria-label="Search market question"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="input w-36 text-xs" aria-label="Filter by strategy" value={strategy} onChange={e => setStrategy(e.target.value)}>
          {strategies.map(s => <option key={s} value={s}>{s === 'all' ? 'All strategies' : s}</option>)}
        </select>

        <select className="input w-32 text-xs" aria-label="Filter by action" value={action} onChange={e => setAction(e.target.value)}>
          {actions.map(a => <option key={a} value={a}>{a === 'all' ? 'All actions' : a}</option>)}
        </select>

        <span className="mono text-xs text-zinc-600 whitespace-nowrap">
          {filtered.length} <span className="text-zinc-700">/</span> {signals.length}
        </span>
      </div>

      {/* Table */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Trade signals">
            <thead>
              <tr className="border-b border-zinc-800">
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-widest w-28">Time</th>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Market</th>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-widest w-28">Strategy</th>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-widest w-24">Action</th>
                <th scope="col" className="px-4 py-3 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest w-20">YES</th>
                <th scope="col" className="px-4 py-3 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest w-20">Limit</th>
                <th scope="col" className="px-4 py-3 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest w-20">Size</th>
                <th scope="col" className="px-4 py-3 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest w-20">Edge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.slice(0, PAGE_SIZE).map(s => {
                const ac = s.action ? (ACTION_CONFIG[s.action] ?? ACTION_CONFIG.SKIP) : ACTION_CONFIG.SKIP
                return (
                  <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-4 py-3 mono text-zinc-600 whitespace-nowrap">
                      {s.run_timestamp?.toDate?.().toLocaleTimeString() ?? '—'}
                    </td>
                    <td className="px-4 py-3 max-w-0 w-full">
                      <p className="text-zinc-200 truncate" title={s.question}>{s.question ?? '—'}</p>
                      <p className="mono text-[10px] text-zinc-500 truncate" aria-hidden="true">{s.condition_id?.slice(0, 12)}…</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{s.strategy ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span aria-hidden="true" className={`status-dot ${ac.dot}`} />
                        <span className={`font-semibold ${ac.text}`}>{ac.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right mono text-zinc-400">
                      {s.yes_price?.toFixed(3) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right mono text-zinc-400">
                      {s.price?.toFixed(3) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right mono">
                      {s.size_usd
                        ? <span className="text-emerald-400">${s.size_usd.toFixed(2)}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right mono">
                      {s.edge
                        ? <span className={s.edge > 0.05 ? 'text-emerald-400' : 'text-zinc-400'}>{s.edge.toFixed(3)}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-zinc-700">
                    No signals match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > PAGE_SIZE && (
          <div className="px-4 py-2.5 border-t border-zinc-800 text-[11px] text-zinc-600">
            Showing {PAGE_SIZE} of {filtered.length} — use filters to narrow down
          </div>
        )}
      </div>

    </div>
  )
}
