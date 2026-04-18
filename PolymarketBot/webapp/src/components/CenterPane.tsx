import { useMemo } from 'react'
import type { Signal, SignalStats } from '../App'

interface Props {
  signals:         Signal[]
  allSignals:      Signal[]
  running:         boolean
  selected:        Signal | null
  setSelectedId:   (id: string) => void
  filterAction:    string;  setFilterAction:    (v: string) => void
  filterStrat:     string;  setFilterStrat:     (v: string) => void
  minEdgeFilter:   number;  setMinEdgeFilter:   (v: number) => void
  searchQ:         string;  setSearchQ:         (v: string) => void
  stats:           SignalStats
}

const ACTION_PILLS = ['ALL', 'BUY_YES', 'BUY_NO', 'SKIP']

const actionColor = (a?: string) =>
  a === 'BUY_YES' ? 'var(--accent)' : a === 'BUY_NO' ? 'var(--danger)' : 'var(--warn)'
const actionBg = (a?: string) =>
  a === 'BUY_YES' ? 'var(--accent-dim)' : a === 'BUY_NO' ? 'var(--danger-dim)' : 'var(--warn-dim)'

export default function CenterPane({
  signals, allSignals, running, selected, setSelectedId,
  filterAction, setFilterAction, filterStrat, setFilterStrat,
  minEdgeFilter, setMinEdgeFilter, searchQ, setSearchQ, stats,
}: Props) {
  const strategies = useMemo(() => {
    const s = new Set(allSignals.map(x => x.strategy).filter(Boolean) as string[])
    return ['ALL', ...s]
  }, [allSignals])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>
      {/* Header / filters */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--line)', padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg-1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Signal feed</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {signals.length} / {allSignals.length}
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}>
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search markets…"
            style={{
              width: '100%', height: 28, paddingLeft: 26, paddingRight: 10,
              background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5,
              outline: 'none', fontSize: 12, color: 'var(--text)',
            }}
          />
        </div>

        {/* Action pills */}
        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--line)' }}>
          {ACTION_PILLS.map(a => (
            <button key={a} onClick={() => setFilterAction(a)} style={{
              padding: '4px 9px', borderRadius: 4, fontSize: 11, fontWeight: 500,
              background: filterAction === a ? 'var(--bg-3)' : 'transparent',
              color: filterAction === a
                ? (a === 'BUY_YES' ? 'var(--accent)' : a === 'BUY_NO' ? 'var(--danger)' : a === 'SKIP' ? 'var(--warn)' : 'var(--text)')
                : 'var(--text-3)',
            }}>{a === 'ALL' ? 'All' : a.replace('_', ' ')}</button>
          ))}
        </div>

        {/* Strategy filter */}
        <select
          value={filterStrat} onChange={e => setFilterStrat(e.target.value)}
          style={{ height: 28, padding: '0 8px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, fontSize: 12, outline: 'none', color: 'var(--text)' }}>
          {strategies.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All strategies' : s}</option>)}
        </select>

        {/* Min edge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 28, border: '1px solid var(--line)', borderRadius: 5, background: 'var(--bg-2)' }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Edge ≥</span>
          <input type="range" min={0} max={0.2} step={0.005} value={minEdgeFilter}
            onChange={e => setMinEdgeFilter(parseFloat(e.target.value))}
            style={{ width: 60, accentColor: 'var(--accent)' }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', width: 34 }}>{minEdgeFilter.toFixed(3)}</span>
        </div>
      </div>

      {/* Edge histogram */}
      <EdgeHistogram signals={allSignals} />

      {/* Feed + detail */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SignalTable signals={signals} selected={selected} setSelectedId={setSelectedId} />
        <SignalDetail signal={selected} />
      </div>
    </div>
  )
}

function EdgeHistogram({ signals }: { signals: Signal[] }) {
  const bins = useMemo(() => {
    const n = 28, arr = Array(n).fill(0), max = 0.15
    signals.filter(s => s.edge != null).forEach(s => {
      const i = Math.min(n - 1, Math.floor(((s.edge!) / max) * n))
      arr[i]++
    })
    return arr as number[]
  }, [signals])
  const maxBin = Math.max(...bins, 1)

  return (
    <div style={{
      height: 52, padding: '8px 16px', borderBottom: '1px solid var(--line)',
      background: 'var(--bg-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
        <span className="label">Edge dist.</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>0 → 15%</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, height: 32 }}>
        {bins.map((count, i) => (
          <div key={i} style={{
            flex: 1,
            height: count > 0 ? (count / maxBin * 100) + '%' : 0,
            minHeight: count > 0 ? 2 : 0,
            background: `rgba(52,211,153,${0.25 + (i / bins.length) * 0.75})`,
            borderRadius: '1px 1px 0 0',
            transition: 'height 0.3s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-3)' }}>
        {signals.filter(s => s.edge).length > 0 && (
          <>
            <span>traded <span className="mono" style={{ color: 'var(--text-2)' }}>{signals.filter(s => s.edge).length}</span></span>
          </>
        )}
      </div>
    </div>
  )
}

const HEADERS = [
  { key: 't',        label: 'TIME',     w: 64 },
  { key: 'market',   label: 'MARKET' },
  { key: 'strategy', label: 'STRAT',   w: 90 },
  { key: 'action',   label: 'ACTION',  w: 80 },
  { key: 'yes',      label: 'YES',     w: 54,  align: 'right' as const },
  { key: 'limit',    label: 'LIMIT',   w: 54,  align: 'right' as const },
  { key: 'edge',     label: 'EDGE',    w: 66,  align: 'right' as const },
  { key: 'size',     label: 'SIZE',    w: 64,  align: 'right' as const },
]

function SignalTable({ signals, selected, setSelectedId }: {
  signals: Signal[]; selected: Signal | null; setSelectedId: (id: string) => void;
}) {
  const colTemplate = HEADERS.map(h => h.w ? h.w + 'px' : '1fr').join(' ')

  return (
    <div style={{ flex: 1.4, overflow: 'auto', minWidth: 0 }}>
      {/* Sticky header */}
      <div style={{
        display: 'grid', gridTemplateColumns: colTemplate,
        padding: '0 16px', height: 32, alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--line)', background: 'var(--bg-1)',
        position: 'sticky', top: 0, zIndex: 1,
      }}>
        {HEADERS.map(h => (
          <div key={h.key} className="label" style={{ textAlign: h.align || 'left' }}>{h.label}</div>
        ))}
      </div>

      {signals.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          No signals match your filters.
        </div>
      )}

      {signals.map((s, i) => {
        const isSel = selected?.id === s.id
        const ac = actionColor(s.action)
        const ab = actionBg(s.action)
        const timeStr = s.run_timestamp?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? '—'
        return (
          <div
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            className={i === 0 ? 'row-in' : ''}
            style={{
              display: 'grid', gridTemplateColumns: colTemplate,
              padding: '0 16px', height: 44, alignItems: 'center', gap: 10,
              borderBottom: '1px solid var(--line)',
              background: isSel ? 'var(--bg-2)' : 'transparent',
              borderLeft: '2px solid ' + (isSel ? 'var(--accent)' : 'transparent'),
              paddingLeft: 14, cursor: 'pointer', fontSize: 12,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' }}
            onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <div className="mono" style={{ color: 'var(--text-3)', fontSize: 11 }}>{timeStr.slice(0, 8)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
                {s.question ?? '—'}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                {s.condition_id ? s.condition_id.slice(0, 12) + '…' : s.strategy}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.strategy ?? '—'}
            </div>
            <div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 7px', borderRadius: 3, background: ab,
                color: ac, fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
              }}>
                <div style={{ width: 4, height: 4, borderRadius: 999, background: ac }} />
                {(s.action ?? 'SKIP').replace('_', ' ')}
              </span>
            </div>
            <div className="mono" style={{ textAlign: 'right', color: 'var(--text)' }}>
              {s.yes_price?.toFixed(3) ?? '—'}
            </div>
            <div className="mono" style={{ textAlign: 'right', color: 'var(--text-2)' }}>
              {s.price?.toFixed(3) ?? '—'}
            </div>
            <div className="mono" style={{ textAlign: 'right' }}>
              {s.edge != null
                ? <span style={{ color: s.edge > 0.05 ? 'var(--accent)' : 'var(--text)' }}>{s.edge.toFixed(4)}</span>
                : <span style={{ color: 'var(--text-3)' }}>—</span>}
            </div>
            <div className="mono" style={{ textAlign: 'right', color: s.size_usd ? 'var(--text)' : 'var(--text-3)' }}>
              {s.size_usd ? '$' + s.size_usd.toFixed(0) : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SignalDetail({ signal }: { signal: Signal | null }) {
  if (!signal) {
    return (
      <div style={{
        width: 300, borderLeft: '1px solid var(--line)', background: 'var(--bg-1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)', fontSize: 12, padding: 20, textAlign: 'center', flexShrink: 0,
      }}>
        Select a signal to see why it fired.
      </div>
    )
  }

  const ac = actionColor(signal.action)
  const ab = actionBg(signal.action)
  const yesPrice = signal.yes_price ?? 0
  const estimate = signal.fair_prob ?? yesPrice
  const delta    = estimate - yesPrice

  return (
    <div style={{ width: 300, borderLeft: '1px solid var(--line)', background: 'var(--bg-1)', overflow: 'auto', flexShrink: 0 }}>
      {/* Market */}
      <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
        <div className="label" style={{ marginBottom: 4 }}>Signal</div>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: 'var(--text)' }}>{signal.question ?? '—'}</div>
        {signal.condition_id && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            {signal.condition_id.slice(0, 20)}…
          </div>
        )}
      </div>

      {/* Decision banner */}
      <div style={{ margin: 16, padding: 12, borderRadius: 8, background: ab, border: '1px solid ' + ac + '40' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, letterSpacing: '0.08em' }}>DECISION</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: ac, marginTop: 2 }}>
              {(signal.action ?? 'SKIP').replace('_', ' ')}
            </div>
          </div>
          {signal.edge != null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, letterSpacing: '0.08em' }}>EDGE</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: ac, marginTop: 2 }}>
                {signal.edge.toFixed(4)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Price vs estimate bar */}
      <div style={{ padding: '0 16px 16px' }}>
        <div className="label" style={{ marginBottom: 10 }}>Price vs estimate</div>
        <div style={{ position: 'relative', height: 36, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: 4 }}>
          <div style={{ position: 'absolute', inset: 4, display: 'flex' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ flex: 1, borderRight: '1px dashed var(--line)' }} />
            ))}
          </div>
          {/* Market price */}
          <div style={{
            position: 'absolute', left: `calc(${yesPrice * 100}% + 4px)`, top: 0, bottom: 0,
            width: 2, background: 'var(--text-2)', transform: 'translateX(-1px)',
          }}>
            <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              mkt {yesPrice.toFixed(3)}
            </div>
          </div>
          {/* Estimate */}
          {signal.fair_prob != null && (
            <div style={{
              position: 'absolute', left: `calc(${estimate * 100}% + 4px)`, top: 0, bottom: 0,
              width: 2, background: ac, transform: 'translateX(-1px)',
            }}>
              <div style={{ position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: ac, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                est {estimate.toFixed(3)}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 10, color: 'var(--text-3)' }}>
          <span>0.00 (NO)</span>
          <span>1.00 (YES)</span>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--line)' }} />

      {/* Trade details */}
      <DetailBlock label="Trade">
        <DR k="Strategy"   v={signal.strategy ?? '—'} />
        <DR k="Side"       v={(signal.action ?? 'SKIP').replace('_', ' ')} vColor={ac} />
        <DR k="Market price" v={yesPrice.toFixed(4)} mono />
        {signal.fair_prob != null && <>
          <DR k="Estimate"  v={estimate.toFixed(4)} mono />
          <DR k="Delta"     v={(delta >= 0 ? '+' : '') + delta.toFixed(4)} mono vColor={delta > 0 ? 'var(--accent)' : 'var(--danger)'} />
        </>}
        {signal.price != null && <DR k="Limit price" v={signal.price.toFixed(4)} mono />}
        {signal.reason && <DR k="Reason" v={signal.reason} />}
      </DetailBlock>

      <div style={{ height: 1, background: 'var(--line)' }} />

      <DetailBlock label="Sizing">
        <DR k="Order size"   v={signal.size_usd ? '$' + signal.size_usd.toFixed(2) : '—'} mono />
        <DR k="Edge"         v={signal.edge?.toFixed(4) ?? '—'} mono vColor={signal.edge ? 'var(--accent)' : undefined} />
        {signal.edge && signal.size_usd && (
          <DR k="Exp. P&L" v={'+$' + (signal.size_usd * signal.edge).toFixed(2)} mono vColor="var(--accent)" />
        )}
      </DetailBlock>
    </div>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px' }}>
      <div className="label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gap: 6 }}>{children}</div>
    </div>
  )
}

function DR({ k, v, mono, vColor }: { k: string; v: string; mono?: boolean; vColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--text-3)' }}>{k}</span>
      <span className={mono ? 'mono' : ''} style={{ color: vColor || 'var(--text)', fontWeight: 500 }}>{v}</span>
    </div>
  )
}
