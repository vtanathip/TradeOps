# Gold strategy validation plan

How to take a XAUUSD strategy from idea to real money **without fooling yourself**.
The core idea: a backtest is an *approximation of one venue using a model*, so no
single number is trustworthy. Confidence comes from **triangulation** — three
independent views that each close a different gap, and that must roughly agree.

```text
Dukascopy tick history   →  strategy research   (does an edge exist at all?)
IBKR 1-min bars (recent) →  venue-matched test  (does the edge survive MY broker?)
IBKR paper               →  execution truth     (does it survive real fills?)
        │                          │                        │
   deep + free               correct prices            real latency/slippage
   proxy venue               shallow history           limited duration
```

Only promote a strategy to the next tier when the current one passes. If the three
disagree, the backtest was lying — and the table below tells you *which* lie.

---

## Why three tiers — the two gaps

A Dukascopy backtest differs from live IBKR trading along **two independent axes**.
Each tier exists to close one of them.

**Gap 1 — venue (data).** Dukascopy's bid/ask come from *its* liquidity pool. IBKR's
gold quotes come from *IBKR's* providers. Different price path, different spread,
different cost structure (CFD-style wide spread vs IBKR's tight-spread-plus-commission
-plus-financing). A strategy that prints money on Dukascopy prices may not on IBKR's.

**Gap 2 — execution (model).** Even on perfect data, a backtest fills instantly at
top-of-book with no latency, no slippage, no partial fills, no depth. Live, your
order travels to the exchange, the market moves, and a large clip eats into liquidity
you can't see. Only real (paper) order flow exposes this.

| Tier | Closes | Leaves open |
|------|--------|-------------|
| 1 — Dukascopy | nothing (research) | venue **and** execution |
| 2 — IBKR bars | venue (Gap 1) | execution (Gap 2) |
| 3 — IBKR paper | execution (Gap 2) | (psychology, real-money fills) |

---

## Tier 1 — Dukascopy tick history (research)

**Purpose:** answer the cheapest, most important question first — *is there any edge?*
Burn deep, free history here so you fail fast before spending IBKR's rate-limited quota.

**Data:** `scripts/build_m1_from_ticks.py` downloads Dukascopy **tick** data (bid+ask
paired per row) and aggregates to paired 1-minute bars. ~23 years available, free, no
auth. Tick is the finest time-grain a retail source offers.

**Why tick, not the m1-per-price download:** Dukascopy's m1 candles come one price side
at a time, on different minute grids; forward-filling them onto a common grid fabricates
crossed books (`ask < bid`) and fake fills. See [dukascopy-data-issues.md](dukascopy-data-issues.md).
Tick rows are already paired, so the spread is real and crossing is impossible.

**Limits / what it is NOT:**
- It's a **proxy venue** — not your broker's prices.
- **Top-of-book only** — no order-book depth, so no size/slippage modeling.
- We currently aggregate to m1; for maximum fidelity feed raw `QuoteTick`s straight to
  the engine (NautilusTrader ingests them natively) instead of the m1 step.

**Exit gate:** the strategy shows a real edge *after* a realistic spread (~0.3–0.6 USD
for gold) and commission. If it only works at zero cost, stop here.

---

## Tier 2 — IBKR recent 1-min bars (venue-matched backtest)

**Purpose:** re-run the *same* strategy on your actual broker's prices and spec. If the
edge evaporates when you swap Dukascopy spot prices for IBKR's gold contract, it was
venue-specific noise.

**Instrument: GC gold futures (decided).** Spot XAUUSD has no market/historical data on
this account; the **GC future is accessible** (10-min delayed, which is fine for a
*historical* backtest). So Tier 2 targets GC, with its real spec:
- **GC**: COMEX, 100 oz/contract, **$0.10 tick** ($10/tick), ~$405k notional, ~**30–35:1**.
- **MGC** (E-Micro, 10 oz): same leverage at 1/10 the size — the right granularity for a
  modest account (a single GC is ~$405k notional; size with MGC).
- Model it as a Nautilus **futures instrument** (multiplier 100/10, price increment 0.10,
  COMEX venue, realistic margin) — *not* the 5-decimal FX-pair the current backtest uses.

**Caveat — spot vs futures basis:** the strategy is researched on *spot* XAUUSD but
validated on *futures*. Gold futures ≈ spot + cost-of-carry (small contango). For a
trend-following EMA cross this basis is negligible, but note it; they are correlated, not
identical, instruments.

**Data path (grounded in measured limits):** IBKR delayed data is fine here, but:
- `get_price_history` caps at **3,500 points/request** — measured: 3,491 one-min GC bars =
  only **~2.4 days**. So a year of 1-min ≈ ~150 paged requests.
- **Pacing** ~60 requests / 10 min, and IBKR drops data silently when throttled (same trap
  as the Dukascopy download) → paginate politely and **assert completeness**.
- Per-contract history only reaches that contract's **listing date** → you must build a
  **continuous front-month series**: pull each expiry, roll on volume/OI crossover (or N
  days pre-expiry), and back-adjust prices across the roll.

**Pragmatic sequencing:** start **coarse** — a 1-hour or daily continuous GC series (few
requests, trivially within caps) — to answer *does the edge survive IBKR gold prices at
all?* Only build the expensive **1-min continuous** series (~150 paged, pacing-limited
requests) if the coarse pass still shows an edge.

**Model IBKR's real costs (not a CFD spread):** futures don't bake cost into a wide spread
— it's a tight ~$0.30/oz spread **+ commission per contract** (IBKR futures commission +
exchange/reg fees, fill in the actual schedule) **+ financing** is embedded in the futures
price (cost-of-carry), so no separate swap line.

**Exit gate:** the edge survives on IBKR prices with IBKR costs.

---

## Tier 3 — IBKR paper (execution truth)

**Purpose:** the only tier that reveals what a backtest fundamentally cannot — real
fills, latency, slippage, partial fills, rejects, and order-type behavior. This is the
real accuracy check; no backtest replaces it.

**Setup:** your IBKR paper account (TWS API on port 7497) is already verified and
working. Run the strategy live against the paper feed for a meaningful window (weeks,
across different regimes — quiet, trending, news).

**What to compare:** paper fills vs the Tier-2 backtest's fills on the *same* signals —
fill price slippage, timing lag, and any signals that fired in backtest but didn't fill
live. Persistent gaps quantify Gap 2.

**Exit gate:** paper P&L tracks the Tier-2 backtest within a tolerance you can live with.
Only then consider small live size.

---

## Reconciliation — reading the disagreements

Run all three and line up the equity curves. The divergence pattern is diagnostic:

| Symptom | Likely cause | Fix |
|---|---|---|
| Tier 1 ≫ Tier 2 | venue gap: Dukascopy spread/path flatters the strategy | trust IBKR; the edge is venue-specific |
| Tier 2 ≫ Tier 3 | execution gap: slippage/latency/partial fills | add slippage + latency to the model; resize |
| All three negative | no edge (the honest case) | iterate the strategy, not the harness |
| Tier 1 wildly positive, others flat | data artifact (e.g. crossed-book) | audit the data first — see lessons below |

The goal is **agreement**, not a big number. Three views that agree on a modest edge
beat one backtest that promises 1882%.

---

## Pre-flight checklist (fix before any number means anything)

Hard lessons from this repo's first backtest. Until these are addressed, even a clean
data feed produces an untradeable number:

- [x] **Data integrity** — paired bid/ask, no crossed books, completeness asserted
      (done via the tick pipeline; the old ffill bug is documented).
- [ ] **Correct instrument** — model gold with a real $0.01 tick and sane leverage, not
      a 5-decimal FX pair at ~3333× effective leverage.
- [ ] **Real costs** — commission + financing/swap, matched to the venue being tested.
- [ ] **Weekend/session gaps** — don't let the EMA blend Friday close into Monday open,
      or assume orders fill through a closed market.
- [ ] **Honest accounting** — mark-to-market equity (not just realized cash), and report
      risk metrics (annualized return, Sharpe, max drawdown) — not a raw cumulative %.
- [ ] **Completeness checks everywhere** — both Dukascopy and IBKR drop data silently
      when throttled; assert bars/day and request-count sanity, never trust a 0 exit code.

---

## Real IBKR numbers (measured 2026-06-25, via the connected account)

Probed live so the plan rests on facts, not doc estimates:

**Contracts (verified IDs):**
- Spot **XAUUSD "London Gold"** — `contract_id 69067924`, exchange `IBCMDTY`, type CMDTY (this is what the backtest models).
- **GC** gold future — underlying `17340718`, COMEX, 100 oz/contract, **$0.10 tick**.
- **MGC** E-Micro Gold — underlying `79702479`, COMEX, 10 oz/contract (1/10 the size).

**GC front-active (Aug 2026) snapshot:** bid 4055.6 / ask 4055.9 → **spread ≈ $0.30/oz** =
$30/contract = **0.74 bps**; notional **$405,580/contract**; open interest 273,569.
→ Good news: IBKR's gold spread is the *same order* as Dukascopy's (~0.3–0.6) — the
research feed isn't flattering the strategy on spread.

**Leverage (futures):** GC initial margin is ~$11–13k/contract (exchange-set, volatility-
dependent) → effective **~30–35:1** on $405k notional. MGC = same leverage, 1/10 size.
This is the realistic ceiling — **not** the backtest's 100:1 (let alone the ~3333:1 FX-pair bug).

**Data-access reality on this connection (a real blocker for Tier 2/3):**
- Spot **XAUUSD: no market data and no historical data** ("No historical market data
  available", empty snapshot) → needs the **spot-metals market-data subscription**.
- **GC futures: accessible but 10-minute DELAYED** (`delayed: 600`), no real-time.
- `get_account_summary` returns **all zeros** → the connected account isn't reporting a
  funded balance, so exact per-position margin can't be read here. Confirm on a funded
  account (or a what-if order) before trusting the leverage number above.
- `get_price_history` hard cap: **3,500 data points per request** → 1-min history must be
  paginated (a month of 1-min already exceeds it), and per-contract futures history only
  reaches back to that contract's listing (deep history needs contract stitching).

**Decision this forces:** the backtest models *spot XAUUSD*, but on this account spot has
no data while the *GC future* does (delayed). Either (a) enable the spot-metals
subscription to validate against XAUUSD as-is, or (b) validate against GC/MGC futures and
adopt their spec ($0.10 tick, 100/10 oz, ~30–35:1, contract roll). Pick before Tier 2.

## Status in this repo

- Tier 1 data pipeline: **built and verified** ([build_m1_from_ticks.py](../scripts/build_m1_from_ticks.py),
  `--selftest` + `crossed == 0` + ≥800 bars/day asserts).
- The first backtest's headline (+1882%) was a **data artifact**, not alpha
  ([dukascopy-data-issues.md](dukascopy-data-issues.md)).
- Tier 2 / Tier 3: not yet started. Next: pull IBKR's `reqHeadTimestamp` + current gold
  spread to scope the venue-matched backtest, and fix the Pre-flight model issues.
