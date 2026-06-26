# XAU-NT-Wrangler

A spread-aware [NautilusTrader](https://nautilustrader.io) gold backtesting harness —
and a worked study in **why gold backtests lie, and how to make them honest**. Every
headline number this project first produced turned out to be a data or execution
artifact. The value is the *method* for catching that, not any strategy.

## The story in one box

| Stage | Headline | What it really was | Honest number |
|-------|----------|--------------------|---------------|
| First spot backtest | **+1882%** | `ffill` of two feeds fabricated crossed books (`ask < bid` on 42% of minutes) → buys filled *below* the bid | data artifact |
| After tick-sourced data | — | properly paired bid/ask, 0 crossed | **−94.4%** (no edge, whipsaw) |
| First GC futures backtest | **+2.1%** | zero-latency fills at the signal bar's close | execution artifact |
| After a 100 ms latency model | — | fills at the next bar | **−30.4%** (16 trades = noise) |

Two different layers (data, then execution), same lesson: **the strategy is the easy
10%; making the data and fills honest is the work.** A multi-agent audit even produced
two *false positives* of its own — so every finding here was empirically re-verified.

## Documentation

- **[docs/dukascopy-data-issues.md](docs/dukascopy-data-issues.md)** — the crossed-book bug:
  why forward-filling two event-driven feeds fabricated the +1882%, with reproducible evidence.
- **[docs/gold-data-and-gc-futures.md](docs/gold-data-and-gc-futures.md)** — the data
  mismatches (spot vs futures, last-vs-bid/ask, single-vs-continuous) and how GC gold
  futures actually work (specs, margin/leverage, expiry/roll, basis), plus the ranked audit.
- **[docs/gold-strategy-validation-plan.md](docs/gold-strategy-validation-plan.md)** — the
  3-tier validation ladder (Dukascopy research → IBKR GC venue-match → IBKR paper) with
  real measured IBKR numbers.

## Layout

```text
backtest.py                     # Tier 1: spread-aware spot XAUUSD backtest (+ charts)
backtest_gc.py                  # Tier 2: venue-matched IBKR GC futures backtest
scripts/
  build_m1_from_ticks.py        # CORRECT data source: Dukascopy TICK → paired 1m bid/ask
  download_dukascopy.sh         # legacy m1-per-price downloader (produces UNPAIRED feeds)
docs/                           # the three reference docs above
data/  reports/  requirements.txt
```

CSV columns: `timestamp,open,high,low,close,volume` (timestamp = epoch ms, UTC).

## Setup

NautilusTrader has no wheels for Python 3.14 — pin 3.13 with [`uv`](https://docs.astral.sh/uv/):

```bash
uv venv --python 3.13 .venv
uv pip install -r requirements.txt
```

## Data — use TICK, not m1-per-price

This is the heart of the project. Dukascopy logs a **bid** candle only when the bid
moved and an **ask** candle only when the ask moved, so the two m1 feeds sit on
**different minute grids**. The original approach (`download_dukascopy.sh` + a `union().ffill()`
in the backtest) pairs a *fresh* quote on one side with a *stale* one on the other →
`ask < bid` on **42% of minutes** → fictional fills → the fake +1882%.

The fix is to download **tick** data, where bid and ask are already paired in one row:

```bash
.venv/bin/python scripts/build_m1_from_ticks.py xauusd 2025 2026-06-25   # → data/xauusd-m1/{bid,ask}.csv
.venv/bin/python scripts/build_m1_from_ticks.py --selftest               # offline invariant check
```

It resamples both sides from one tick stream, so `ask ≥ bid` holds by construction
(asserted: `crossed == 0`, `≥ 800 bars/day`). **Run it sequentially** — a parallel
fan-out triggers Dukascopy throttling that silently returns ~6% of the ticks (the
script retries and asserts completeness to catch this). The legacy `download_dukascopy.sh`
remains for reference but produces the unpaired feeds that caused the bug.

## Spread context (Dukascopy vs a live broker)

![Dukascopy vs Eightcap spread](reports/spread_dukascopy_vs_eightcap.png)

Measured Dukascopy XAUUSD spread (paired minutes): **~0.44 USD** (2003–2026) rising to
**~0.69** in 2025–26 as gold ran to ~$4000. Comparable to — even wider than — a retail
CFD broker's quoted spread, so the harness is *not* flattering on spread. Measured IBKR
**GC futures** spread is **~$0.30/oz**. The live-vs-backtest gaps that remain are
commission, spread blowouts around news, and slippage — none modelable without real
top-of-book data. Detail in the docs.

## Backtests

```bash
.venv/bin/python backtest.py 2025-01-01          # Tier 1: spot XAUUSD (tick-sourced)
.venv/bin/python backtest_gc.py                  # Tier 2: IBKR GC futures (hourly)
LATENCY_MS=500 .venv/bin/python backtest_gc.py   # sweep execution latency
```

**Design.** Bid/ask quote ticks set the simulated exchange's book (buys fill at ask,
sells at bid — every round-trip pays the spread). The EMA signal is driven off the bid
bars (`...-BID-EXTERNAL`). A 100 ms `LatencyModel` makes orders fill at the **next** bar,
not the signal bar's close. The strategy is NautilusTrader's bundled `EMACross` (50/200)
— a harness demo, **not** a trading system. Both honest results are losses; that's the
correct, data-driven answer for a no-alpha MA cross paying real spread.

> A note on the latency value: with *bar* data the result is insensitive to it — any
> latency from 1 ns to one bar fills at the same next-bar quote (verified: 1/100/500 ms
> give identical −30.4%). It only becomes a calibratable parameter on tick data.

## Lessons

1. **A backtest headline is guilty until proven innocent.** +1882% and +2.1% were both
   artifacts — of data alignment and execution timing respectively.
2. **Use the finest-grain source you can.** Tick data eliminates the crossed-book bug at
   the root and is the only way execution realism (latency, slippage) becomes real.
3. **Assert completeness, never trust an exit code.** Throttled downloads return partial
   data and exit 0; a `≥ 800 bars/day` check is what caught it.
4. **Audit the audit.** A 21-agent review produced two confident false positives; only
   empirical re-verification separated them from the real findings.

## Notes

- Large CSVs, `.venv`, and caches are git-ignored; charts in `reports/` are committed.
- Tier 2/3 (IBKR GC venue-match, paper) are planned in the validation-plan doc; the GC
  harness is a coarse first pass, not a trustworthy result yet.
