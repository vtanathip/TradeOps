import { useMemo } from 'react'
import type { Signal, SignalStats, RunRequest } from '../App'

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const fmtPct   = (n: number, d: number) => d ? ((n / d) * 100).toFixed(0) + '%' : '—'

const STATUS_DOT: Record<string, string> = {
  pending:   'var(--warn)',
  running:   'var(--info)',
  completed: 'var(--text-3)',
  failed:    'var(--danger)',
}
const STATUS_TEXT: Record<string, string> = {
  pending:   'var(--warn)',
  running:   'var(--info)',
  completed: 'var(--text-2)',
  failed:    'var(--danger)',
}

interface Props {
  stats:    SignalStats
  runs:     RunRequest[]
  deployed: number
  signals:  Signal[]
}

export default function RightRail({ stats, runs, deployed, signals }: Props) {
  const totalNotional = useMemo(() =>
    signals.filter(s => s.action === 'BUY_YES' || s.action === 'BUY_NO')
      .reduce((s, x) => s + (x.size_usd ?? 0), 0),
    [signals]
  )

  return (
    <div style={{
      width: 300, borderLeft: '1px solid var(--line)', background: 'var(--bg-1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Results</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Live stats + recent runs</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>

        {/* Session card */}
        <Section label="Session">
          <div style={{ padding: 14, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Deployed</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                  {fmtMoney(deployed)}
                </div>
              </div>
              <PnlSpark />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Signals</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{stats.total}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Traded</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{stats.traded}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Avg edge</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>
                  {stats.avgEdge > 0 ? stats.avgEdge.toFixed(3) : '—'}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Signal mix */}
        {stats.total > 0 && (
          <Section label="Signal mix">
            <SignalMix stats={stats} />
          </Section>
        )}

        {/* By strategy */}
        {Object.keys(stats.byStrat).length > 0 && (
          <Section label="By strategy">
            <div style={{ display: 'grid', gap: 6 }}>
              {Object.entries(stats.byStrat).map(([sid, v]) => {
                const edgeAvg = (v.yes + v.no) > 0 ? v.edgeSum / (v.yes + v.no) : 0
                const skipPct = v.total ? v.skip / v.total : 0
                return (
                  <div key={sid} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{sid}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>
                        {fmtMoney(v.notional)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 2, height: 4, marginBottom: 6, borderRadius: 2, overflow: 'hidden', background: 'var(--bg-3)' }}>
                      <div style={{ width: fmtPct(v.yes, v.total), background: 'var(--accent)' }} />
                      <div style={{ width: fmtPct(v.no, v.total),  background: 'var(--danger)' }} />
                      <div style={{ width: fmtPct(v.skip, v.total), background: 'var(--warn)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)' }}>
                      <span><span className="mono" style={{ color: 'var(--text-2)' }}>{v.total}</span> signals</span>
                      <span><span className="mono" style={{ color: 'var(--text-2)' }}>{edgeAvg.toFixed(3)}</span> edge</span>
                      <span><span className="mono" style={{ color: 'var(--text-2)' }}>{(skipPct * 100).toFixed(0)}%</span> skip</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Recent runs */}
        <Section label="Recent runs">
          {runs.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              No runs yet
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {runs.slice(0, 8).map(r => (
                <div key={r.id} style={{
                  padding: '8px 10px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--bg-2)',
                  display: 'grid', gridTemplateColumns: '8px 1fr auto', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_DOT[r.status] ?? 'var(--text-3)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                      {r.config?.strategy === 'fair_value' ? 'Fair Value' : r.config?.strategy === 'market_making' ? 'Market Making' : r.status}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {r.created_at?.toDate?.().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) ?? '—'}
                      {r.signal_count != null && <> · {r.signal_count} signals</>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: STATUS_TEXT[r.status] ?? 'var(--text-2)', fontWeight: 500, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {r.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <span className="label">{label}</span>
      </div>
      {children}
    </div>
  )
}

function PnlSpark() {
  const path = useMemo(() => {
    const n = 20
    let y = 20
    const pts: string[] = []
    for (let i = 0; i < n; i++) {
      y += (Math.random() - 0.45) * 6
      y = Math.max(6, Math.min(34, y))
      pts.push(`${(i / (n - 1)) * 72},${y}`)
    }
    return 'M ' + pts.join(' L ')
  }, [])

  return (
    <svg width="72" height="40" viewBox="0 0 72 40">
      <path d={path} stroke="var(--accent)" strokeWidth="1.5" fill="none" />
      <path d={path + ' L 72,40 L 0,40 Z'} fill="var(--accent)" opacity="0.08" />
    </svg>
  )
}

function SignalMix({ stats }: { stats: SignalStats }) {
  const total = Math.max(1, stats.total)
  const segs = [
    { label: 'BUY YES', v: stats.buyYes, c: 'var(--accent)' },
    { label: 'BUY NO',  v: stats.buyNo,  c: 'var(--danger)' },
    { label: 'SKIP',    v: stats.skip,   c: 'var(--warn)' },
  ]
  let cum = 0
  const R = 28, C = 34
  const segments = segs.map(s => {
    const start = cum / total
    cum += s.v
    const end = cum / total
    if (start === end) return null
    const a0 = start * 2 * Math.PI - Math.PI / 2
    const a1 = end   * 2 * Math.PI - Math.PI / 2
    const large = end - start > 0.5 ? 1 : 0
    const x0 = C + R * Math.cos(a0), y0 = C + R * Math.sin(a0)
    const x1 = C + R * Math.cos(a1), y1 = C + R * Math.sin(a1)
    return { d: `M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`, c: s.c, label: s.label, v: s.v }
  }).filter(Boolean)

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
      <svg width="68" height="68" viewBox="0 0 68 68">
        {segments.map((s, i) => s && <path key={i} d={s.d} fill={s.c} />)}
        <circle cx={C} cy={C} r="14" fill="var(--bg-2)" />
        <text x={C} y={C - 2} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-2)" fontWeight="600">{total}</text>
        <text x={C} y={C + 9} textAnchor="middle" fontSize="6" fill="var(--text-3)" fontWeight="600" letterSpacing="0.4">SIGNALS</text>
      </svg>
      <div style={{ display: 'grid', gap: 4, flex: 1 }}>
        {segs.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.c, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text-2)' }}>{s.label}</span>
            <span className="mono" style={{ color: 'var(--text)', fontWeight: 500 }}>{s.v}</span>
            <span className="mono" style={{ color: 'var(--text-3)', width: 34, textAlign: 'right' }}>
              {fmtPct(s.v, total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
