import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'

interface Signal {
  id:             string;
  run_timestamp?: { toDate: () => Date };
  question?:      string;
  strategy?:      string;
  action?:        string;
  edge?:          number;
  size_usd?:      number;
}

interface StrategyGroup {
  total:  number;
  buyYes: number;
  buyNo:  number;
  skip:   number;
  edges:  number[];
  usd:    number;
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(0)}%` : '—'
}

function StatCard({ label, value, sub, accent = 'text-zinc-100' }: {
  label: string; value: React.ReactNode; sub?: string; accent?: string;
}) {
  return (
    <div className="surface p-4">
      <p className="section-label mb-2">{label}</p>
      <p className={`text-2xl font-bold mono ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function StatsPanel() {
  const [signals, setSignals] = useState<Signal[]>([])

  useEffect(() => {
    const q = query(collection(db, 'signals'), orderBy('run_timestamp', 'desc'), limit(1000))
    return onSnapshot(q, snap => {
      setSignals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Signal)))
    })
  }, [])

  if (signals.length === 0) {
    return (
      <div className="surface p-16 text-center">
        <svg className="w-8 h-8 text-zinc-800 mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 11h3v3H1v-3zm4-5h3v8H5V6zm4-4h3v12H9V2zm4 7h-1v5h1V9z"/>
        </svg>
        <p className="text-sm text-zinc-600">No signals yet</p>
        <p className="text-xs text-zinc-700 mt-1">Run a strategy to see analytics</p>
      </div>
    )
  }

  const total   = signals.length
  const buyYes  = signals.filter(s => s.action === 'BUY_YES')
  const buyNo   = signals.filter(s => s.action === 'BUY_NO')
  const skipped = signals.filter(s => s.action === 'SKIP')
  const traded  = [...buyYes, ...buyNo]
  const avgEdge = avg(traded.map(s => s.edge).filter((e): e is number => e != null))
  const totalUsd = traded.reduce((sum, s) => sum + (s.size_usd ?? 0), 0)

  const byStrategy: Record<string, StrategyGroup> = {}
  for (const s of signals) {
    const key = s.strategy ?? 'unknown'
    if (!byStrategy[key]) byStrategy[key] = { total: 0, buyYes: 0, buyNo: 0, skip: 0, edges: [], usd: 0 }
    const g = byStrategy[key]!
    g.total++
    if (s.action === 'BUY_YES') { g.buyYes++; g.edges.push(s.edge ?? 0); g.usd += s.size_usd ?? 0 }
    if (s.action === 'BUY_NO')  { g.buyNo++;  g.edges.push(s.edge ?? 0); g.usd += s.size_usd ?? 0 }
    if (s.action === 'SKIP')    { g.skip++ }
  }

  const topEdge = [...traded]
    .filter(s => s.edge)
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))
    .slice(0, 10)

  return (
    <div className="space-y-5">

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total signals"     value={total} />
        <StatCard label="Buy YES"           value={buyYes.length}  sub={pct(buyYes.length, total)}  accent="text-emerald-400" />
        <StatCard label="Buy NO"            value={buyNo.length}   sub={pct(buyNo.length, total)}   accent="text-red-400" />
        <StatCard label="Skipped"           value={skipped.length} sub={pct(skipped.length, total)} accent="text-zinc-500" />
        <StatCard label="Avg edge (traded)" value={avgEdge != null ? avgEdge.toFixed(4) : '—'}      accent="text-amber-400" />
      </div>

      {/* USD deployed — full width accent bar */}
      {totalUsd > 0 && (
        <div className="surface p-4 flex items-center justify-between">
          <div>
            <p className="section-label mb-1">Total deployed</p>
            <p className="mono text-lg font-bold text-zinc-100">${totalUsd.toFixed(2)}</p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="section-label mb-1">YES notional</p>
              <p className="mono text-sm text-emerald-400">
                ${buyYes.reduce((s, x) => s + (x.size_usd ?? 0), 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="section-label mb-1">NO notional</p>
              <p className="mono text-sm text-red-400">
                ${buyNo.reduce((s, x) => s + (x.size_usd ?? 0), 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Per-strategy breakdown */}
        <div className="surface overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="section-label">By strategy</p>
          </div>
          <table className="w-full text-xs" aria-label="Performance by strategy">
            <thead>
              <tr className="border-b border-zinc-800/60">
                <th scope="col" className="px-4 py-2.5 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Strategy</th>
                <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Total</th>
                <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Yes</th>
                <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">No</th>
                <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Skip%</th>
                <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Edge</th>
                <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {Object.entries(byStrategy).map(([name, g]) => (
                <tr key={name} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-2.5 text-zinc-300 font-medium">{name}</td>
                  <td className="px-4 py-2.5 text-right mono text-zinc-500">{g.total}</td>
                  <td className="px-4 py-2.5 text-right mono text-emerald-400">{g.buyYes}</td>
                  <td className="px-4 py-2.5 text-right mono text-red-400">{g.buyNo}</td>
                  <td className="px-4 py-2.5 text-right mono text-zinc-600">{pct(g.skip, g.total)}</td>
                  <td className="px-4 py-2.5 text-right mono text-amber-400">
                    {avg(g.edges) != null ? avg(g.edges)!.toFixed(4) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-zinc-400">${g.usd.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top edge opportunities */}
        <div className="surface overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="section-label">Top edge opportunities</p>
          </div>
          {topEdge.length === 0 ? (
            <p className="px-4 py-8 text-xs text-zinc-700">No traded signals yet</p>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {topEdge.map((s, i) => (
                <div key={s.id} className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/20 transition-colors">
                  <span className="mono text-[10px] text-zinc-700 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300 truncate" title={s.question}>{s.question}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span aria-hidden="true" className={`status-dot ${s.action === 'BUY_YES' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className={`text-[10px] font-semibold ${s.action === 'BUY_YES' ? 'text-emerald-500' : 'text-red-500'}`}>
                        {s.action}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="mono text-xs text-amber-400 font-semibold">{(s.edge ?? 0).toFixed(4)}</p>
                    <p className="mono text-[10px] text-zinc-600">${(s.size_usd ?? 0).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
