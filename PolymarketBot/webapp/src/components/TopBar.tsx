import type { SignalStats } from '../App'

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

interface Props {
  running:     boolean
  onRun:       () => void
  submitting:  boolean
  stats:       SignalStats
  deployed:    number
  onSignOut:   () => void
}

export default function TopBar({ running, onRun, submitting, stats, deployed, onSignOut }: Props) {
  return (
    <div style={{
      height: 52, borderBottom: '1px solid var(--line)', background: 'var(--bg-1)',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20, flexShrink: 0
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'linear-gradient(135deg, var(--accent), #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--bg)' }} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1 }}>Polymarket Bot</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Cockpit / main</div>
        </div>
      </div>

      <div style={{ width: 1, height: 24, background: 'var(--line)' }} />

      {/* Status chip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
        background: running ? 'var(--accent-dim)' : 'var(--bg-2)',
        border: '1px solid var(--line)', borderRadius: 20
      }}>
        <div
          className={running ? 'pulse' : ''}
          style={{ width: 6, height: 6, borderRadius: 999, background: running ? 'var(--accent)' : 'var(--text-3)' }}
        />
        <span className="mono" style={{ fontSize: 11, color: running ? 'var(--accent)' : 'var(--text-2)' }}>
          {running ? 'LIVE' : 'IDLE'}
        </span>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 24, marginLeft: 'auto', alignItems: 'center' }}>
        <Metric label="Signals" value={String(stats.total)} />
        <Metric label="Traded"  value={String(stats.traded)} />
        <Metric label="Avg edge" value={stats.avgEdge > 0 ? stats.avgEdge.toFixed(4) : '—'} />
        <Metric label="Deployed" value={fmtMoney(deployed)} />

        <div style={{ width: 1, height: 24, background: 'var(--line)' }} />

        <button
          onClick={onRun}
          disabled={submitting}
          style={{
            height: 32, padding: '0 14px', borderRadius: 6, fontWeight: 600, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            background: running ? 'var(--danger)' : 'var(--accent)',
            color: running ? '#fff' : '#071a11',
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>
          {running ? (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
              Running…
            </>
          ) : submitting ? (
            'Queuing…'
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor"/></svg>
              Run strategy
            </>
          )}
        </button>

        <div style={{ width: 1, height: 24, background: 'var(--line)' }} />

        <button
          onClick={onSignOut}
          title="Sign out"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', padding: '4px 6px', borderRadius: 4 }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
            <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  )
}
