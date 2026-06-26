"""
Tier 2 — venue-matched backtest on IBKR GC gold futures (COMEX).

Same strategy as backtest.py (EMACross 50/200), but on IBKR's actual gold contract
instead of Dukascopy spot, to test whether any edge survives the real venue. See
docs/gold-strategy-validation-plan.md.

Data: data/gc-1h/last.csv — GC hourly OHLC pulled from IBKR (last-trade prices; IBKR
historical has no bid/ask). So we model GC's spread as a FIXED $0.30/oz (= measured live
snapshot bid/ask), splitting it ±$0.15 into synthetic bid/ask bars so fills are spread-
aware (buy@ask, sell@bid) the same way the spot backtest is.

Instrument: GC = 100 oz/contract, $0.10 tick, ~$405k notional, margin ~3% (~33x). We trade
1 contract on a realistic $100k account. ponytail: coarse hourly first pass (per the plan)
— if an edge shows here, rebuild on the expensive 1-min continuous series.
"""
import os
from decimal import Decimal

import pandas as pd

from nautilus_trader.backtest.engine import BacktestEngine, BacktestEngineConfig
from nautilus_trader.backtest.models import LatencyModel
from nautilus_trader.config import LoggingConfig
from nautilus_trader.examples.strategies.ema_cross import EMACross, EMACrossConfig
from nautilus_trader.model import BarType, Money, Venue
from nautilus_trader.model.currencies import USD
from nautilus_trader.model.enums import AccountType, AssetClass, OmsType
from nautilus_trader.model.identifiers import InstrumentId, Symbol
from nautilus_trader.model.instruments.futures_contract import FuturesContract
from nautilus_trader.model.objects import Price, Quantity
from nautilus_trader.persistence.wranglers import BarDataWrangler, QuoteTickDataWrangler

CSV = "data/gc-1h/last.csv"
VENUE = Venue("COMEX")
HALF_SPREAD = 0.15  # half of the measured ~$0.30/oz GC top-of-book spread
START_BAL = 100_000.0

df = pd.read_csv(CSV)
df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
df = df.set_index("timestamp")[["open", "high", "low", "close", "volume"]].sort_index()
print(f"Loaded {len(df):,} GC hourly bars  {df.index[0]} -> {df.index[-1]}")

# synthetic bid/ask from last-trade OHLC: identical grid, fixed $0.30 spread -> no crossing
px = ["open", "high", "low", "close"]
bid, ask = df.copy(), df.copy()
bid[px] -= HALF_SPREAD
ask[px] += HALF_SPREAD

# --- GC futures instrument (real spec) ---
instrument = FuturesContract(
    instrument_id=InstrumentId(symbol=Symbol("GC"), venue=VENUE),
    raw_symbol=Symbol("GC"),
    asset_class=AssetClass.COMMODITY,
    exchange="COMEX",
    currency=USD,
    price_precision=1,
    price_increment=Price.from_str("0.1"),   # $0.10 tick
    multiplier=Quantity.from_int(100),        # 100 oz/contract
    lot_size=Quantity.from_int(1),
    underlying="GC",
    activation_ns=int(pd.Timestamp("2025-01-01", tz="UTC").value),
    expiration_ns=int(pd.Timestamp("2026-08-27", tz="UTC").value),
    margin_init=Decimal("0.03"),              # ~3% -> ~33x, matches COMEX/IBKR gold
    margin_maint=Decimal("0.03"),
    maker_fee=Decimal("0.0000062"),           # ~ IBKR $2.5/contract on ~$405k notional
    taker_fee=Decimal("0.0000062"),
    ts_event=int(pd.Timestamp("2025-01-01", tz="UTC").value),
    ts_init=int(pd.Timestamp("2025-01-01", tz="UTC").value),
)

ticks = QuoteTickDataWrangler(instrument).process_bar_data(bid_data=bid, ask_data=ask)
bar_type = BarType.from_str(f"{instrument.id}-1-HOUR-BID-EXTERNAL")
bid_bars = BarDataWrangler(bar_type, instrument).process(bid)
print(f"Built {len(ticks):,} quote ticks + {len(bid_bars):,} bid bars")

engine = BacktestEngine(config=BacktestEngineConfig(logging=LoggingConfig(log_level=os.environ.get("LOG", "ERROR"))))
engine.add_venue(
    venue=VENUE,
    oms_type=OmsType.NETTING,
    account_type=AccountType.MARGIN,
    base_currency=USD,
    starting_balances=[Money(START_BAL, USD)],
    default_leverage=Decimal(1),  # leverage comes from the 3% futures margin, not account leverage
    # Order latency so market orders fill at the NEXT bar, not the signal bar's close.
    # Without this, fills land on the exact close that triggered the cross (zero execution lag)
    # — the apparent +2.1% was entirely that artifact and flips negative under any latency.
    # With BAR data the result is insensitive to the exact value: any latency from ~1ns up to
    # one bar fills at the next bar's first quote (no intra-bar quotes exist). LATENCY_MS tunes it.
    latency_model=LatencyModel(base_latency_nanos=int(os.environ.get("LATENCY_MS", "100")) * 1_000_000),
)
print(f"latency: {os.environ.get('LATENCY_MS', '100')}ms")
engine.add_instrument(instrument)
engine.add_data(ticks)
engine.add_data(bid_bars)
engine.add_strategy(
    EMACross(
        EMACrossConfig(
            instrument_id=instrument.id,
            bar_type=bar_type,
            trade_size=Decimal(1),  # 1 GC contract = 100 oz
            fast_ema_period=50,
            slow_ema_period=200,
        )
    )
)
engine.run()

acct = engine.trader.generate_account_report(VENUE)
fills = engine.trader.generate_order_fills_report()
pos = engine.trader.generate_positions_report()

# Note: summing ALL positions-report rows (15 netting snapshots + 1 final) is CORRECT —
# the realized_pnl values are per-segment increments and sum to the equity change. Verified:
# sum(all rows) == acct total change. (An audit flagged this as double-counting; that was a
# false positive — the is_snapshot=False row alone is NOT the total.)
equity_end = float(acct["total"].iloc[-1]) if len(acct) else START_BAL
pnl = pos["realized_pnl"].str.split().str[0].astype(float) if len(pos) else pd.Series(dtype=float)
buyhold = (df["close"].iloc[-1] - df["close"].iloc[0]) * 100  # hold 1 contract (100 oz)

print(f"\nfills: {len(fills)}  closed positions: {len(pos)}")
print(f"end equity: ${equity_end:,.0f}  return: {(equity_end / START_BAL - 1):+.1%}  realized PnL: ${pnl.sum():+,.0f}")
print(f"buy&hold 1 GC contract over window: ${buyhold:+,.0f}  ({buyhold / START_BAL:+.1%})")
if len(pos):
    wins = (pnl > 0).sum()
    print(f"win rate: {wins}/{len(pos)} = {wins / len(pos):.1%}  avg PnL/trade: ${pnl.mean():+,.0f}")
engine.dispose()
