import type { RunConfig, RiskConfig } from '../App'

const STRATEGIES = [
  { id: 'fair_value',    name: 'Fair Value',     desc: 'Trade when market price diverges from your probability estimate.' },
  { id: 'market_making', name: 'Market Making',  desc: 'Provide liquidity by quoting both sides of the book.' },
]

const fmtMoney = (n: number) => '$' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const fmtPct   = (n: number) => (n * 100).toFixed(0) + '%'

interface Props {
  cfg:         RunConfig
  setCfg:      (c: RunConfig) => void
  running:     boolean
  onRun:       () => void
  submitting:  boolean
}

export default function LeftRail({ cfg, setCfg, running, onRun, submitting }: Props) {
  const setRisk = (key: keyof RiskConfig, val: number) =>
    setCfg({ ...cfg, risk: { ...cfg.risk, [key]: val } })
  const setTop = <K extends keyof RunConfig>(key: K, val: RunConfig[K]) =>
    setCfg({ ...cfg, [key]: val })

  const maxExposure = Math.min(cfg.risk.bankroll_usd, cfg.risk.max_position_usd * cfg.market_limit)
  const exposurePct = maxExposure / cfg.risk.bankroll_usd
  const currentStrat = STRATEGIES.find(s => s.id === cfg.strategy)!

  const presets = [
    { name: 'Conservative', apply: () => setCfg({ ...cfg, risk: { ...cfg.risk, min_edge: 0.06, kelly_fraction: 0.15, max_position_usd: 100 } }) },
    { name: 'Balanced',     apply: () => setCfg({ ...cfg, risk: { ...cfg.risk, min_edge: 0.04, kelly_fraction: 0.25, max_position_usd: 200 } }) },
    { name: 'Aggressive',   apply: () => setCfg({ ...cfg, risk: { ...cfg.risk, min_edge: 0.02, kelly_fraction: 0.50, max_position_usd: 500 } }) },
  ]

  return (
    <div style={{
      width: 300, borderRight: '1px solid var(--line)', background: 'var(--bg-1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0
    }}>
      <RailHeader title="Strategy" subtitle="Configure & deploy" />

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
        {/* Strategy cards */}
        <Section label="Strategy">
          <div style={{ display: 'grid', gap: 6 }}>
            {STRATEGIES.map(strat => (
              <button
                key={strat.id}
                onClick={() => setTop('strategy', strat.id as RunConfig['strategy'])}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid ' + (cfg.strategy === strat.id ? 'var(--accent)' : 'var(--line)'),
                  background: cfg.strategy === strat.id
                    ? 'rgba(52,211,153,0.08)'
                    : 'var(--bg-2)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: 999,
                    background: cfg.strategy === strat.id ? 'var(--accent)' : 'var(--text-3)',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{strat.name}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.35, marginLeft: 15 }}>
                  {strat.desc}
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* Scan config */}
        <Section label="Scan">
          <FieldInput label="Markets" value={cfg.market_limit} onChange={v => setTop('market_limit', v)} step={1} min={1} max={500} suffix="markets" />
          {cfg.strategy === 'fair_value' && (
            <FieldInput label="YES probability" value={cfg.fair_prob} onChange={v => setTop('fair_prob', v)} step={0.01} min={0.01} max={0.99} />
          )}
          {cfg.strategy === 'market_making' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <FieldInput label="Half spread" value={cfg.half_spread}     onChange={v => setTop('half_spread', v)}     step={0.005} />
              <FieldInput label="Tail cutoff" value={cfg.tail_cutoff}     onChange={v => setTop('tail_cutoff', v)}     step={0.01} />
              <FieldInput label="Res. days"   value={cfg.resolution_days} onChange={v => setTop('resolution_days', v)} step={1} min={1} />
            </div>
          )}
        </Section>

        {/* Risk */}
        <Section label="Risk" right={
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
            max {fmtMoney(maxExposure)}
          </span>
        }>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FieldInput label="Bankroll"     value={cfg.risk.bankroll_usd}      onChange={v => setRisk('bankroll_usd', v)}      step={100} prefix="$" />
            <FieldInput label="Max position" value={cfg.risk.max_position_usd}  onChange={v => setRisk('max_position_usd', v)}  step={10}  prefix="$" />
            <FieldInput label="Min liquidity" value={cfg.risk.min_liquidity_usd} onChange={v => setRisk('min_liquidity_usd', v)} step={100} prefix="$" />
            <FieldInput label="Min edge"     value={cfg.risk.min_edge}          onChange={v => setRisk('min_edge', v)}          step={0.005} />
            <FieldInput label="Kelly frac"   value={cfg.risk.kelly_fraction}    onChange={v => setRisk('kelly_fraction', v)}    step={0.05} />
            <FieldInput label="Max spread"   value={cfg.risk.max_spread}        onChange={v => setRisk('max_spread', v)}        step={0.005} />
          </div>

          {/* Exposure bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label">Exposure preview</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)' }}>
                {fmtPct(exposurePct)} of bankroll
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: Math.min(100, exposurePct * 100) + '%',
                background: exposurePct > 0.8 ? 'var(--danger)' : exposurePct > 0.5 ? 'var(--warn)' : 'var(--accent)',
                transition: 'width 0.3s, background 0.3s',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: 'var(--text-3)' }}>
              <span>$0</span>
              <span className="mono">{fmtMoney(cfg.risk.bankroll_usd)}</span>
            </div>
          </div>
        </Section>

        {/* Presets */}
        <Section label="Presets">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {presets.map(p => (
              <button key={p.name} onClick={p.apply} style={{
                padding: '6px 4px', borderRadius: 5, border: '1px solid var(--line)',
                background: 'var(--bg-2)', fontSize: 11, color: 'var(--text-2)',
              }}>{p.name}</button>
            ))}
          </div>
        </Section>
      </div>

      {/* Run footer */}
      <div style={{ padding: 16, borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
        <button
          onClick={onRun}
          disabled={submitting}
          style={{
            width: '100%', height: 40, borderRadius: 6, fontWeight: 600, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: running ? 'var(--danger)' : 'var(--accent)',
            color: running ? '#fff' : '#071a11',
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>
          {running ? (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
              Running {currentStrat.name}…
            </>
          ) : submitting ? (
            'Queuing…'
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor"/></svg>
              Run {currentStrat.name}
            </>
          )}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--text-3)' }}>
          <span>Paper trading</span>
          <span className="mono">⌘ + ↵</span>
        </div>
      </div>
    </div>
  )
}

function RailHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>
    </div>
  )
}

function Section({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span className="label">{label}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

function FieldInput({
  label, value, onChange, step = 0.01, min = 0, max, prefix, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label} {suffix && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({suffix})</span>}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: '1px solid var(--line)', borderRadius: 5,
        background: 'var(--bg-2)', height: 28, padding: '0 8px',
      }}>
        {prefix && <span style={{ color: 'var(--text-3)', marginRight: 4, fontSize: 11 }}>{prefix}</span>}
        <input
          className="mono"
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', width: '100%' }}
        />
      </div>
    </div>
  )
}
