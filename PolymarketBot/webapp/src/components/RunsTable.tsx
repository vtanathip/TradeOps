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

const ACTION_STYLES: Record<ActionType, string> = {
  BUY_YES: 'bg-green-900 text-green-300',
  BUY_NO:  'bg-red-900  text-red-300',
  HOLD:    'bg-yellow-900 text-yellow-300',
  SKIP:    'bg-gray-800  text-gray-500',
}

const PAGE_SIZE = 50

export default function RunsTable() {
  const [signals,  setSignals]  = useState<Signal[]>([])
  const [strategy, setStrategy] = useState('all')
  const [action,   setAction]   = useState('all')
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    const q = query(
      collection(db, 'signals'),
      orderBy('run_timestamp', 'desc'),
      limit(500)
    )
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
      <div className="card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Search question</label>
          <input
            className="input"
            placeholder="Filter by market question…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Strategy</label>
          <select className="input w-40" value={strategy} onChange={e => setStrategy(e.target.value)}>
            {strategies.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select className="input w-32" value={action} onChange={e => setAction(e.target.value)}>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <span className="text-xs text-gray-500 pb-2">
          {filtered.length} / {signals.length} signals
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Market</th>
              <th className="px-4 py-3 text-left">Strategy</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-right">YES price</th>
              <th className="px-4 py-3 text-right">Limit price</th>
              <th className="px-4 py-3 text-right">Size $</th>
              <th className="px-4 py-3 text-right">Edge</th>
              <th className="px-4 py-3 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, PAGE_SIZE).map((s, i) => (
              <tr
                key={s.id}
                className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${
                  i % 2 === 0 ? '' : 'bg-gray-900/30'
                }`}
              >
                <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                  {s.run_timestamp?.toDate?.().toLocaleString() ?? '—'}
                </td>
                <td className="px-4 py-2.5 max-w-[220px]">
                  <p className="text-gray-200 truncate text-xs" title={s.question}>{s.question}</p>
                  <p className="text-gray-600 text-[10px] font-mono truncate">{s.condition_id?.slice(0, 16)}…</p>
                </td>
                <td className="px-4 py-2.5 text-gray-400 text-xs">{s.strategy}</td>
                <td className="px-4 py-2.5">
                  <span className={`badge ${s.action ? (ACTION_STYLES[s.action] ?? 'bg-gray-800 text-gray-400') : 'bg-gray-800 text-gray-400'}`}>
                    {s.action}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">
                  {s.yes_price?.toFixed(3) ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">
                  {s.price ? s.price.toFixed(3) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {s.size_usd ? (
                    <span className="text-green-400">${s.size_usd.toFixed(2)}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {s.edge ? (
                    <span className={s.edge > 0.05 ? 'text-green-400' : 'text-gray-400'}>
                      {s.edge.toFixed(3)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[200px]">
                  <span className="truncate block" title={s.reason}>{s.reason}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-600">
                  No signals match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > PAGE_SIZE && (
          <p className="px-4 py-2 text-xs text-gray-600 border-t border-gray-800">
            Showing first {PAGE_SIZE} of {filtered.length} results. Use filters to narrow down.
          </p>
        )}
      </div>
    </div>
  )
}
