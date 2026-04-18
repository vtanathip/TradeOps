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

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-yellow-900 text-yellow-300',
  running:   'bg-blue-900 text-blue-300',
  completed: 'bg-green-900 text-green-300',
  failed:    'bg-red-900 text-red-300',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function NumInput({
  value, onChange, step = 0.01, min = 0, max,
}: {
  value:    number;
  onChange: (v: number) => void;
  step?:    number;
  min?:     number;
  max?:     number;
}) {
  return (
    <input
      type="number"
      className="input"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(Number(e.target.value))}
    />
  )
}

export default function TriggerPanel() {
  const [cfg, setCfg]         = useState<RunConfig>(DEFAULT_CONFIG)
  const [runs, setRuns]       = useState<RunRequest[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query(
      collection(db, 'run_requests'),
      orderBy('created_at', 'desc'),
      limit(20)
    )
    return onSnapshot(q, snap => {
      setRuns(snap.docs.map(d => ({ id: d.id, ...d.data() } as RunRequest)))
    })
  }, [])

  const setRisk = (key: keyof RiskConfigForm, val: number) =>
    setCfg(c => ({ ...c, risk: { ...c.risk, [key]: val } }))

  const setTop = <K extends keyof RunConfig>(key: K, val: RunConfig[K]) =>
    setCfg(c => ({ ...c, [key]: val }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await addDoc(collection(db, 'run_requests'), {
        status:     'pending',
        created_at: serverTimestamp(),
        config:     cfg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Config form */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Configure Run</h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          <Field label="Strategy">
            <select
              className="input"
              value={cfg.strategy}
              onChange={e => setTop('strategy', e.target.value as RunConfig['strategy'])}
            >
              <option value="fair_value">Fair Value</option>
              <option value="market_making">Market Making</option>
            </select>
          </Field>

          <Field label="Markets to scan">
            <NumInput value={cfg.market_limit} step={1} min={1} max={50}
              onChange={v => setTop('market_limit', v)} />
          </Field>

          {cfg.strategy === 'fair_value' && (
            <Field label="Your probability estimate for YES (fair_prob)">
              <NumInput value={cfg.fair_prob} step={0.01} min={0.01} max={0.99}
                onChange={v => setTop('fair_prob', v)} />
            </Field>
          )}
          {cfg.strategy === 'market_making' && (<>
            <Field label="Half spread">
              <NumInput value={cfg.half_spread} step={0.005} min={0.005} max={0.2}
                onChange={v => setTop('half_spread', v)} />
            </Field>
            <Field label="Tail cutoff (skip near 0 or 1)">
              <NumInput value={cfg.tail_cutoff} step={0.01} min={0.01} max={0.2}
                onChange={v => setTop('tail_cutoff', v)} />
            </Field>
            <Field label="Resolution days (widen spread within N days)">
              <NumInput value={cfg.resolution_days} step={1} min={1} max={30}
                onChange={v => setTop('resolution_days', v)} />
            </Field>
          </>)}

          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Risk Config</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bankroll (USD)">
                <NumInput value={cfg.risk.bankroll_usd} step={100} min={100}
                  onChange={v => setRisk('bankroll_usd', v)} />
              </Field>
              <Field label="Max position (USD)">
                <NumInput value={cfg.risk.max_position_usd} step={10} min={10}
                  onChange={v => setRisk('max_position_usd', v)} />
              </Field>
              <Field label="Min edge">
                <NumInput value={cfg.risk.min_edge} step={0.01} min={0.01} max={0.5}
                  onChange={v => setRisk('min_edge', v)} />
              </Field>
              <Field label="Kelly fraction">
                <NumInput value={cfg.risk.kelly_fraction} step={0.05} min={0.05} max={1}
                  onChange={v => setRisk('kelly_fraction', v)} />
              </Field>
              <Field label="Min liquidity (USD)">
                <NumInput value={cfg.risk.min_liquidity_usd} step={100} min={0}
                  onChange={v => setRisk('min_liquidity_usd', v)} />
              </Field>
              <Field label="Max spread">
                <NumInput value={cfg.risk.max_spread} step={0.01} min={0.01} max={0.5}
                  onChange={v => setRisk('max_spread', v)} />
              </Field>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Queuing…' : '▶  Run Strategy'}
          </button>
        </form>
      </div>

      {/* Run history */}
      <div className="card flex flex-col">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Run History</h2>
        {runs.length === 0
          ? <p className="text-gray-600 text-sm">No runs yet. Submit a config to start.</p>
          : (
            <div className="space-y-2 overflow-y-auto max-h-[600px] pr-1">
              {runs.map(run => (
                <div key={run.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`badge ${STATUS_STYLES[run.status] ?? 'bg-gray-700 text-gray-300'}`}>
                      {run.status}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {run.created_at?.toDate?.().toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs space-y-0.5">
                    <div>
                      <span className="text-gray-500">strategy </span>
                      <span className="text-gray-200">{run.config?.strategy}</span>
                      <span className="text-gray-500 ml-2">markets </span>
                      <span className="text-gray-200">{run.config?.market_limit}</span>
                    </div>
                    {run.signal_count != null && (
                      <div>
                        <span className="text-gray-500">signals </span>
                        <span className="text-green-400">{run.signal_count}</span>
                      </div>
                    )}
                    {run.error && (
                      <div className="text-red-400 truncate" title={run.error}>{run.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>

    </div>
  )
}
