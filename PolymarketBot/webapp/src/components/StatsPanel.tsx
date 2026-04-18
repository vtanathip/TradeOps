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

interface StatCardProps {
  label:   string;
  value:   React.ReactNode;
  sub?:    string;
  accent?: string;
}

function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function pct(n: number, total: number): string {
  if (!total) return '—'
  return `${((n / total) * 100).toFixed(1)}%`
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

export default function StatsPanel() {
  const [signals, setSignals] = useState<Signal[]>([])

  useEffect(() => {
    const q = query(
      collection(db, 'signals'),
      orderBy('run_timestamp', 'desc'),
      limit(1000)
    )
    return onSnapshot(q, snap => {
      setSignals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Signal)))
    })
  }, [])

  if (signals.length === 0) {
    return (
      <div className="card text-center py-16 text-gray-600">
        No signals yet. Run a strategy to see stats.
      </div>
    )
  }

  const total    = signals.length
  const buyYes   = signals.filter(s => s.action === 'BUY_YES')
  const buyNo    = signals.filter(s => s.action === 'BUY_NO')
  const skipped  = signals.filter(s => s.action === 'SKIP')
  const traded   = [...buyYes, ...buyNo]
  const avgEdge  = avg(traded.map(s => s.edge).filter((e): e is number => e != null))
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

  const tradedSorted = [...traded]
    .filter(s => s.edge)
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))
    .slice(0, 10)

  return (
    <div className="space-y-6">

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total signals"      value={total} />
        <StatCard label="BUY YES"            value={buyYes.length}  sub={pct(buyYes.length, total)}  accent="text-green-400" />
        <StatCard label="BUY NO"             value={buyNo.length}   sub={pct(buyNo.length, total)}   accent="text-red-400" />
        <StatCard label="Skipped"            value={skipped.length} sub={pct(skipped.length, total)} accent="text-gray-500" />
        <StatCard label="Avg edge (traded)"  value={avgEdge != null ? avgEdge.toFixed(4) : '—'}      accent="text-yellow-400" />
      </div>

      {/* Suppress unused variable warning — totalUsd is shown in future extensions */}
      {totalUsd > 0 && null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Per-strategy table */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">By Strategy</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                <th className="pb-2 text-left">Strategy</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">BUY YES</th>
                <th className="pb-2 text-right">BUY NO</th>
                <th className="pb-2 text-right">Skip %</th>
                <th className="pb-2 text-right">Avg edge</th>
                <th className="pb-2 text-right">$ deployed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byStrategy).map(([name, g]) => (
                <tr key={name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 text-gray-200 text-xs">{name}</td>
                  <td className="py-2 text-right text-gray-400">{g.total}</td>
                  <td className="py-2 text-right text-green-400">{g.buyYes}</td>
                  <td className="py-2 text-right text-red-400">{g.buyNo}</td>
                  <td className="py-2 text-right text-gray-500">{pct(g.skip, g.total)}</td>
                  <td className="py-2 text-right text-yellow-400 font-mono text-xs">
                    {avg(g.edges) != null ? avg(g.edges)!.toFixed(4) : '—'}
                  </td>
                  <td className="py-2 text-right text-gray-300 font-mono text-xs">
                    ${g.usd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top edge opportunities */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Top 10 Edge Opportunities</h2>
          {tradedSorted.length === 0
            ? <p className="text-gray-600 text-sm">No traded signals yet.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                    <th className="pb-2 text-left">Market</th>
                    <th className="pb-2 text-left">Action</th>
                    <th className="pb-2 text-right">Edge</th>
                    <th className="pb-2 text-right">Size $</th>
                  </tr>
                </thead>
                <tbody>
                  {tradedSorted.map(s => (
                    <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 text-xs text-gray-300 max-w-[160px] truncate" title={s.question}>
                        {s.question}
                      </td>
                      <td className="py-2">
                        <span className={`badge text-[10px] ${
                          s.action === 'BUY_YES' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        }`}>{s.action}</span>
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-yellow-400">
                        {(s.edge ?? 0).toFixed(4)}
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-gray-300">
                        ${(s.size_usd ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>

      </div>
    </div>
  )
}
