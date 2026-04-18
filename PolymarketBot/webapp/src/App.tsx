import { useState, useEffect, useMemo } from 'react'
import { signOut } from 'firebase/auth'
import { collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import TopBar from './components/TopBar'
import LeftRail from './components/LeftRail'
import CenterPane from './components/CenterPane'
import RightRail from './components/RightRail'

export interface Signal {
  id:             string
  run_timestamp?: { toDate: () => Date }
  question?:      string
  condition_id?:  string
  strategy?:      string
  action?:        'BUY_YES' | 'BUY_NO' | 'HOLD' | 'SKIP'
  yes_price?:     number
  price?:         number
  size_usd?:      number
  edge?:          number
  reason?:        string
  fair_prob?:     number
}

export interface RunRequest {
  id:            string
  status:        'pending' | 'running' | 'completed' | 'failed'
  created_at?:   { toDate: () => Date }
  config?:       RunConfig
  signal_count?: number
  error?:        string
}

export interface RiskConfig {
  bankroll_usd:      number
  max_position_usd:  number
  min_edge:          number
  kelly_fraction:    number
  min_liquidity_usd: number
  max_spread:        number
}

export interface RunConfig {
  strategy:        'fair_value' | 'market_making'
  market_limit:    number
  fair_prob:       number
  half_spread:     number
  tail_cutoff:     number
  resolution_days: number
  risk:            RiskConfig
}

export const DEFAULT_CONFIG: RunConfig = {
  strategy:        'fair_value',
  market_limit:    10,
  fair_prob:       0.60,
  half_spread:     0.02,
  tail_cutoff:     0.05,
  resolution_days: 3,
  risk: {
    bankroll_usd:      1000,
    max_position_usd:  100,
    min_edge:          0.04,
    kelly_fraction:    0.25,
    min_liquidity_usd: 500,
    max_spread:        0.05,
  },
}

export interface SignalStats {
  total:   number
  buyYes:  number
  buyNo:   number
  skip:    number
  avgEdge: number
  traded:  number
  byStrat: Record<string, { total: number; yes: number; no: number; skip: number; edgeSum: number; notional: number }>
}

export default function App() {
  const [cfg, setCfg] = useState<RunConfig>(DEFAULT_CONFIG)
  const [signals, setSignals]   = useState<Signal[]>([])
  const [runs, setRuns]         = useState<RunRequest[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterAction, setFilterAction] = useState('ALL')
  const [filterStrat,  setFilterStrat]  = useState('ALL')
  const [minEdgeFilter, setMinEdgeFilter] = useState(0)
  const [searchQ, setSearchQ] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'signals'), orderBy('run_timestamp', 'desc'), limit(500))
    return onSnapshot(q, snap => {
      setSignals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Signal)))
    })
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'run_requests'), orderBy('created_at', 'desc'), limit(20))
    return onSnapshot(q, snap => {
      setRuns(snap.docs.map(d => ({ id: d.id, ...d.data() } as RunRequest)))
    })
  }, [])

  const running = runs.some(r => r.status === 'running' || r.status === 'pending')

  async function handleRun() {
    setSubmitting(true)
    try {
      await addDoc(collection(db, 'run_requests'), {
        status: 'pending', created_at: serverTimestamp(), config: cfg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const filteredSignals = useMemo(() => {
    return signals.filter(s => {
      if (filterAction !== 'ALL' && s.action !== filterAction) return false
      if (filterStrat  !== 'ALL' && s.strategy !== filterStrat) return false
      if (minEdgeFilter > 0 && (s.edge ?? 0) < minEdgeFilter) return false
      if (searchQ && !s.question?.toLowerCase().includes(searchQ.toLowerCase())) return false
      return true
    })
  }, [signals, filterAction, filterStrat, minEdgeFilter, searchQ])

  const selected = selectedId
    ? signals.find(s => s.id === selectedId) ?? filteredSignals[0]
    : filteredSignals[0]

  const stats: SignalStats = useMemo(() => {
    const buyYes = signals.filter(s => s.action === 'BUY_YES').length
    const buyNo  = signals.filter(s => s.action === 'BUY_NO').length
    const skip   = signals.filter(s => s.action === 'SKIP' || s.action === 'HOLD').length
    const traded = signals.filter(s => s.action === 'BUY_YES' || s.action === 'BUY_NO')
    const avgEdge = traded.length
      ? traded.reduce((a, s) => a + (s.edge ?? 0), 0) / traded.length
      : 0
    const byStrat: SignalStats['byStrat'] = {}
    signals.forEach(s => {
      const k = s.strategy ?? 'unknown'
      if (!byStrat[k]) byStrat[k] = { total: 0, yes: 0, no: 0, skip: 0, edgeSum: 0, notional: 0 }
      byStrat[k]!.total++
      if (s.action === 'BUY_YES') { byStrat[k]!.yes++; byStrat[k]!.edgeSum += s.edge ?? 0; byStrat[k]!.notional += s.size_usd ?? 0 }
      if (s.action === 'BUY_NO')  { byStrat[k]!.no++;  byStrat[k]!.edgeSum += s.edge ?? 0; byStrat[k]!.notional += s.size_usd ?? 0 }
      if (s.action === 'SKIP' || s.action === 'HOLD') byStrat[k]!.skip++
    })
    return { total: signals.length, buyYes, buyNo, skip, avgEdge, traded: buyYes + buyNo, byStrat }
  }, [signals])

  const deployed = useMemo(() =>
    signals.filter(s => s.action === 'BUY_YES' || s.action === 'BUY_NO')
      .reduce((sum, s) => sum + (s.size_usd ?? 0), 0),
    [signals]
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>
      <TopBar
        running={running}
        onRun={handleRun}
        submitting={submitting}
        stats={stats}
        deployed={deployed}
        onSignOut={() => void signOut(auth)}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <LeftRail
          cfg={cfg}
          setCfg={setCfg}
          running={running}
          onRun={handleRun}
          submitting={submitting}
        />
        <CenterPane
          signals={filteredSignals}
          allSignals={signals}
          running={running}
          selected={selected ?? null}
          setSelectedId={setSelectedId}
          filterAction={filterAction}  setFilterAction={setFilterAction}
          filterStrat={filterStrat}    setFilterStrat={setFilterStrat}
          minEdgeFilter={minEdgeFilter} setMinEdgeFilter={setMinEdgeFilter}
          searchQ={searchQ}            setSearchQ={setSearchQ}
          stats={stats}
        />
        <RightRail
          stats={stats}
          runs={runs}
          deployed={deployed}
          signals={signals}
        />
      </div>
      <HotkeyFooter running={running} />
    </div>
  )
}

function HotkeyFooter({ running }: { running: boolean }) {
  return (
    <div style={{
      height: 24, borderTop: '1px solid var(--line)', background: 'var(--bg-1)',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 14,
      fontSize: 10, color: 'var(--text-3)', flexShrink: 0
    }}>
      <span>Paper trading <span style={{ color: running ? 'var(--accent)' : 'var(--text-3)' }}>●</span></span>
      <div style={{ flex: 1 }} />
      <span><span className="kbd">↑↓</span> navigate</span>
      <span><span className="kbd">Enter</span> execute</span>
      <span><span className="kbd">S</span> skip</span>
      <span><span className="kbd">⌘↵</span> run/stop</span>
      <div style={{ width: 1, height: 12, background: 'var(--line)' }} />
      <span>v0.8 · paper mode</span>
    </div>
  )
}
