"""
Spread-aware NautilusTrader backtest on Dukascopy XAUUSD 1-minute bars.

We have BOTH bid and ask 1m bars, so we build QuoteTicks (4 per bar: O/H/L/C)
via QuoteTickDataWrangler.process_bar_data(). Feeding quotes means the simulated
exchange holds a real bid/ask book: buys fill at ASK, sells at BID — i.e. every
round-trip pays the gold CFD spread, the way live trading does. Bid-only bars
would fill with zero spread and flatter every result.

The EMA signal bars are aggregated INTERNALly from the quotes (BID side), so the
strategy reacts to the same prices the fills are referenced against.

Strategy: bundled EMACross (fast/slow EMA) — demo of the pipeline, not alpha.

Run (inside the project venv):
    .venv/bin/python backtest.py                 # default: from 2025-01-01
    .venv/bin/python backtest.py 2024-01-01       # custom start
    .venv/bin/python backtest.py all              # full history (~1.27M bars, slow)
"""

import os
import sys
from decimal import Decimal

import pandas as pd

from nautilus_trader.backtest.engine import BacktestEngine, BacktestEngineConfig
from nautilus_trader.backtest.models import LatencyModel
from nautilus_trader.config import LoggingConfig
from nautilus_trader.examples.strategies.ema_cross import EMACross, EMACrossConfig
from nautilus_trader.model import BarType, Money, Venue
from nautilus_trader.model.currencies import USD
from nautilus_trader.model.enums import AccountType, OmsType
from nautilus_trader.persistence.wranglers import BarDataWrangler, QuoteTickDataWrangler
from nautilus_trader.test_kit.providers import TestInstrumentProvider

BID_CSV = "data/xauusd-m1/bid.csv"
ASK_CSV = "data/xauusd-m1/ask.csv"
VENUE = Venue("SIM")
START = sys.argv[1] if len(sys.argv) > 1 else "2025-01-01"


def load(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df.set_index("timestamp")[["open", "high", "low", "close", "volume"]]


# Dukascopy logs a bid candle only when the bid moved, an ask candle only when the
# ask moved (flats excluded) -> the two feeds sit on different minute grids. Align them
# on the UNION grid and forward-fill: the prevailing quote persists until it changes.
bid_raw, ask_raw = load(BID_CSV), load(ASK_CSV)

inter = bid_raw.index.intersection(ask_raw.index)  # exact-paired minutes, for spread stats only
sp = ask_raw.loc[inter, "close"] - bid_raw.loc[inter, "close"]
print(f"Dukascopy spread (USD, {len(inter):,} paired min): mean={sp.mean():.3f} median={sp.median():.3f}")

idx = bid_raw.index.union(ask_raw.index)
bid = bid_raw.reindex(idx).ffill()
ask = ask_raw.reindex(idx).ffill()
ok = bid["close"].notna() & ask["close"].notna()
bid, ask = bid[ok], ask[ok]

# ffill pairs a FRESH quote on one side with a STALE one on the other, which makes ask < bid
# on ~42% of minutes -> a crossed book that can't exist live (buys would fill BELOW the bid =
# fictional free money, the entire fake return). Drop any minute whose ask candle dips below the
# bid candle; we don't have a trustworthy two-sided quote there.
# ponytail: drop > clamp — a clamped 0-spread is still fiction, just less profitable fiction.
ohlc = ["open", "high", "low", "close"]
sane = (ask[ohlc].values >= bid[ohlc].values).all(axis=1)
dropped = (~sane).sum()
bid, ask = bid[sane], ask[sane]
print(f"Dropped {dropped:,} crossed-book minutes ({dropped / len(sane):.1%}) — stale-quote ffill artifacts")
if START != "all":
    m = bid.index >= pd.Timestamp(START, tz="UTC")
    bid, ask = bid[m], ask[m]
print(f"Loaded {len(bid):,} aligned bars  {bid.index[0]} -> {bid.index[-1]}")

# --- instrument, quote ticks (spread-aware fills) + bid bars (EMA signal) ---
instrument = TestInstrumentProvider.default_fx_ccy("XAU/USD", VENUE)
ticks = QuoteTickDataWrangler(instrument).process_bar_data(bid_data=bid, ask_data=ask)

# Drive the strategy off the bid bars directly (EXTERNAL) rather than relying on the
# engine to aggregate them from quotes; the quotes still set the bid/ask book for fills.
bar_type = BarType.from_str(f"{instrument.id}-1-MINUTE-BID-EXTERNAL")
bid_bars = BarDataWrangler(bar_type, instrument).process(bid)
print(f"Built {len(ticks):,} quote ticks + {len(bid_bars):,} bid bars")

# --- engine: MARGIN account, 100k USD ---
engine = BacktestEngine(
    config=BacktestEngineConfig(logging=LoggingConfig(log_level=os.environ.get("LOG", "ERROR"))),
)
engine.add_venue(
    venue=VENUE,
    oms_type=OmsType.NETTING,
    account_type=AccountType.MARGIN,
    base_currency=USD,
    starting_balances=[Money(1_000_000, USD)],
    default_leverage=Decimal(100),  # gold CFD style; 1000 oz @ ~$4k = $4M notional -> $40k margin
    # 100ms latency -> fills at the NEXT bar, not the signal bar's close (no zero-lag execution).
    latency_model=LatencyModel(base_latency_nanos=100_000_000),
)
engine.add_instrument(instrument)
engine.add_data(ticks)
engine.add_data(bid_bars)
engine.add_strategy(
    EMACross(
        EMACrossConfig(
            instrument_id=instrument.id,
            bar_type=bar_type,
            trade_size=Decimal(1000),  # instrument minimum is 1000 units (1 FX-style lot)
            fast_ema_period=50,
            slow_ema_period=200,
        )
    )
)

engine.run()

acct = engine.trader.generate_account_report(VENUE)
fills = engine.trader.generate_order_fills_report()
pos = engine.trader.generate_positions_report()

START_BAL = 1_000_000.0
equity_end = float(acct["total"].iloc[-1]) if len(acct) else START_BAL
# Money columns render as "123.45 USD" strings -> take the numeric part
pnl = pos["realized_pnl"].str.split().str[0].astype(float) if len(pos) else pd.Series(dtype=float)
realized = pnl.sum()
# benchmark: just buy and hold 1000 oz over the same window
buyhold = (bid["close"].iloc[-1] - bid["close"].iloc[0]) * 1000

print(f"\nfills: {len(fills)}  closed positions: {len(pos)}")
print(f"end equity: ${equity_end:,.0f}  return: {(equity_end / START_BAL - 1):+.1%}  realized PnL: ${realized:+,.0f}")
print(f"buy&hold 1000oz over window: ${buyhold:+,.0f}  ({(buyhold / START_BAL):+.1%})")
if len(pos):
    wins = (pnl > 0).sum()
    print(f"win rate: {wins}/{len(pos)} = {wins / len(pos):.1%}  avg PnL/trade: ${pnl.mean():+,.0f}")
# --- charts -> reports/ ---
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

os.makedirs("reports", exist_ok=True)
tag = START if START != "all" else "full history"

# 1) equity curve vs buy & hold
eq = acct["total"].astype(float)
hold = (START_BAL + (bid["close"] - bid["close"].iloc[0]) * 1000).resample("1h").last().dropna()
fig, ax = plt.subplots(figsize=(11, 5))
ax.plot(eq.index, eq.values, lw=1.3, label="EMACross(50/200) strategy")
ax.plot(hold.index, hold.values, lw=1.0, alpha=0.8, label="buy & hold 1000 oz")
ax.axhline(START_BAL, color="gray", ls="--", lw=0.7)
ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"${v / 1e6:.1f}M"))
ax.set_title(f"XAUUSD equity — Dukascopy 1m, spread-aware fills  [{tag} → now]")
ax.set_ylabel("account equity (USD)")
ax.legend(loc="upper left")
ax.grid(alpha=0.3)
fig.tight_layout()
fig.savefig("reports/equity_curve.png", dpi=110)
plt.close(fig)

# 2) price + trade markers
px = bid["close"].resample("1h").last().dropna()
buys, sells = fills[fills["side"] == "BUY"], fills[fills["side"] == "SELL"]
fig, ax = plt.subplots(figsize=(11, 5))
ax.plot(px.index, px.values, color="black", lw=0.8, label="XAUUSD bid")
ax.scatter(buys["ts_last"], buys["avg_px"].astype(float), marker="^", c="green", s=16, zorder=3, label="buy")
ax.scatter(sells["ts_last"], sells["avg_px"].astype(float), marker="v", c="red", s=16, zorder=3, label="sell")
ax.set_title(f"XAUUSD price + EMACross fills  [{tag} → now]")
ax.set_ylabel("price (USD/oz)")
ax.legend(loc="upper left")
ax.grid(alpha=0.3)
fig.tight_layout()
fig.savefig("reports/price_trades.png", dpi=110)
plt.close(fig)

# 3) spread: Dukascopy (full history, monthly median) vs Eightcap typical band
mo = sp.resample("MS").median()
fig, ax = plt.subplots(figsize=(11, 5))
ax.plot(mo.index, mo.values, color="C0", lw=1.4, label="Dukascopy median spread (monthly)")
ax.axhspan(0.12, 0.30, color="orange", alpha=0.25, label="Eightcap typical all-in (~0.12–0.30)")
ax.set_title("XAUUSD spread: Dukascopy (data feed) vs Eightcap (live broker)")
ax.set_ylabel("spread (USD of price)")
ax.legend(loc="upper left")
ax.grid(alpha=0.3)
fig.tight_layout()
fig.savefig("reports/spread_dukascopy_vs_eightcap.png", dpi=110)
plt.close(fig)

print("charts -> reports/{equity_curve,price_trades,spread_dukascopy_vs_eightcap}.png")
engine.dispose()
