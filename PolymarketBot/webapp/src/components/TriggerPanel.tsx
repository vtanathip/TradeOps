import { useState, useEffect } from 'react'
import { collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

interface RiskConfigForm {
  bankroll_usd:      number;
  max_position_usd:  number;
  min_edge:          number;
  kelly_fraction:    number;
  min_liquidity_usd: number;
  max_spread:        number;
}

interface RunConfig {
  strategy:        'fair_value' | 'market_making';
  market_limit:    number;
  fair_prob:       number;
  half_spread:     number;
  tail_cutoff:     number;
  resolution_days: number;
  risk:            RiskConfigForm;
}

interface RunRequest {
  id:            string;
  status:        'pending' | 'running' | 'completed' | 'failed';
  created_at?:   { toDate: () => Date };
  config?:       RunConfig;
  signal_count?: number;
  error?:        string;
}

const DEFAULT_CONFIG: RunConfig = {
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

const STATUS_DOT: Record<string, string> = {
  pending:   'bg-amber-400',
  running:   'bg-blue-400',
  completed: 'bg-emerald-400',
  failed:    'bg-red-400',
}

const STATUS_TEXT: Record<string, string> = {
  pending:   'text-amber-400',
  running:   'text-blue-400',
  completed: 'text-emerald-400',
  failed:    'text-red-400',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="label">{label}</label>
        {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function NumInput({ value, onChange, step = 0.01, min = 0, max }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      className="input mono"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(Number(e.target.value))}
    />
  )
}

function StrategyPill({ label, desc, active, onClick }: {
  label: string; desc: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 p-3 rounded-lg border text-left transition-all duration-150 ${
        active
          ? 'border-emerald-500/50 bg-emerald-500/5 text-zinc-100'
          : 'border-zinc-700 bg-zinc-800/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
      }`}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-[10px] text-zinc-600 pl-3.5">{desc}</p>
    </button>
  )
}

export default function TriggerPanel() {
  const [cfg, setCfg]         = useState<RunConfig>(DEFAULT_CONFIG)
  const [runs, setRuns]       = useState<RunRequest[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'run_requests'), orderBy('created_at', 'desc'), limit(20))
    return onSnapshot(q, snap => {
      setRuns(snap.docs.map(d => ({ id: d.id, ...d.data() } as RunRequest)))
    })
  }, [])

  const setRisk = (key: keyof RiskConfigForm, val: number) =>
    setCfg(c => ({ ...c, risk: { ...c.risk, [key]: val } }))
  const setTop  = <K extends keyof RunConfig>(key: K, val: RunConfig[K]) =>
    setCfg(c => ({ ...c, [key]: val }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await addDoc(collection(db, 'run_requests'), {
        status: 'pending', created_at: serverTimestamp(), config: cfg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

      {/* ── Config form (3/5) ───────────────────────────────────────────── */}
      <div className="xl:col-span-3 surface p-5">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Strategy selector */}
          <div>
            <p className="section-label mb-3">Strategy</p>
            <div className="flex gap-2">
              <StrategyPill
                label="Fair Value" active={cfg.strategy === 'fair_value'}
                desc="Trade when market diverges from your probability estimate"
                onClick={() => setTop('strategy', 'fair_value')}
              />
              <StrategyPill
                label="Market Making" active={cfg.strategy === 'market_making'}
                desc="Provide liquidity by quoting both sides of the book"
                onClick={() => setTop('strategy', 'market_making')}
              />
            </div>
          </div>

          {/* Markets to scan */}
          <Field label="Markets to scan" hint="max 50">
            <NumInput value={cfg.market_limit} step={1} min={1} max={50}
              onChange={v => setTop('market_limit', v)} />
          </Field>

          {/* Strategy params */}
          {cfg.strategy === 'fair_value' && (
            <Field label="YES probability estimate" hint="0.01 – 0.99">
              <NumInput value={cfg.fair_prob} step={0.01} min={0.01} max={0.99}
                onChange={v => setTop('fair_prob', v)} />
            </Field>
          )}
          {cfg.strategy === 'market_making' && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Half spread">
                <NumInput value={cfg.half_spread} step={0.005} min={0.005} max={0.2}
                  onChange={v => setTop('half_spread', v)} />
              </Field>
              <Field label="Tail cutoff">
                <NumInput value={cfg.tail_cutoff} step={0.01} min={0.01} max={0.2}
                  onChange={v => setTop('tail_cutoff', v)} />
              </Field>
              <Field label="Resolution days">
                <NumInput value={cfg.resolution_days} step={1} min={1} max={30}
                  onChange={v => setTop('resolution_days', v)} />
              </Field>
            </div>
          )}

          {/* Risk config */}
          <div>
            <div className="divider" />
            <p className="section-label mb-3">Risk Config</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Bankroll" hint="USD">
                <NumInput value={cfg.risk.bankroll_usd} step={100} min={100}
                  onChange={v => setRisk('bankroll_usd', v)} />
              </Field>
              <Field label="Max position" hint="USD">
                <NumInput value={cfg.risk.max_position_usd} step={10} min={10}
                  onChange={v => setRisk('max_position_usd', v)} />
              </Field>
              <Field label="Min liquidity" hint="USD">
                <NumInput value={cfg.risk.min_liquidity_usd} step={100} min={0}
                  onChange={v => setRisk('min_liquidity_usd', v)} />
              </Field>
              <Field label="Min edge">
                <NumInput value={cfg.risk.min_edge} step={0.01} min={0.01} max={0.5}
                  onChange={v => setRisk('min_edge', v)} />
              </Field>
              <Field label="Kelly fraction">
                <NumInput value={cfg.risk.kelly_fraction} step={0.05} min={0.05} max={1}
                  onChange={v => setRisk('kelly_fraction', v)} />
              </Field>
              <Field label="Max spread">
                <NumInput value={cfg.risk.max_spread} step={0.01} min={0.01} max={0.5}
                  onChange={v => setRisk('max_spread', v)} />
              </Field>
            </div>
          </div>

          <button type="submit" className="btn-run" disabled={loading}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="8" cy="8" r="6" strokeOpacity=".25" />
                  <path d="M14 8a6 6 0 0 0-6-6" />
                </svg>
                Queuing…
              </span>
            ) : 'Run Strategy'}
          </button>
        </form>
      </div>

      {/* ── Run history (2/5) ───────────────────────────────────────────── */}
      <div className="xl:col-span-2 surface p-5 flex flex-col min-h-0">
        <p className="section-label mb-4">Recent Runs</p>

        {runs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-zinc-600">No runs yet</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {runs.map(run => (
              <div key={run.id} className="surface-inset p-3 group">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`status-dot ${STATUS_DOT[run.status] ?? 'bg-zinc-600'}`} />
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${STATUS_TEXT[run.status] ?? 'text-zinc-500'}`}>
                      {run.status}
                    </span>
                  </div>
                  <span className="mono text-[10px] text-zinc-600">
                    {run.created_at?.toDate?.().toLocaleTimeString() ?? '—'}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600">strategy</span>
                    <span className="text-zinc-300 font-medium">
                      {run.config?.strategy === 'fair_value' ? 'Fair Value' : 'Market Making'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600">markets scanned</span>
                    <span className="mono text-zinc-400">{run.config?.market_limit ?? '—'}</span>
                  </div>
                  {run.signal_count != null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-600">signals</span>
                      <span className="mono text-emerald-400 font-semibold">{run.signal_count}</span>
                    </div>
                  )}
                  {run.error && (
                    <p className="text-[10px] text-red-400 truncate pt-0.5" title={run.error}>
                      {run.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
