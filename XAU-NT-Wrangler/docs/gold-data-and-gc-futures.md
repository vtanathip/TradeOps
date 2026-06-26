# Gold data sources, their mismatches, and how GC futures work

Reference for *why the data is the hard part* of a gold strategy, and what GC gold
futures actually are. Goal here is to **document clearly**, not to find an edge.

Companion docs: [dukascopy-data-issues.md](dukascopy-data-issues.md) (the crossed-book
bug), [gold-strategy-validation-plan.md](gold-strategy-validation-plan.md) (the 3-tier
plan + measured IBKR numbers).

---

## Part 1 — The data landscape and where it mismatches

We touch **four** different "gold" data shapes across the project. They do not line up,
and every mismatch is a place a backtest can quietly lie.

### 1.1 The sources

| Source | Instrument | Resolution | Bid/Ask? | History | Venue fidelity |
|--------|-----------|-----------|----------|---------|----------------|
| Dukascopy tick | **spot XAUUSD** | tick (~266k/day) | **paired per tick** | ~23 yr, free | proxy (not your broker) |
| Dukascopy m1-per-price | spot XAUUSD | 1 min | two **separate** feeds | ~23 yr, free | proxy + **crossing bug** |
| IBKR `get_price_history` | **GC future** | 1 min … 1 day | **no — last-trade only** | per-contract, from listing | your venue, 10-min delayed |
| IBKR snapshot | GC future / spot | live | yes (top of book) | none (live only) | your venue |

### 1.2 The mismatches that matter

**(a) Spot vs futures — different instruments.** Dukascopy gives *spot* XAUUSD; the thing
you actually trade at IBKR (with data) is the *GC future*. They are correlated but not
identical — see Part 2 on basis. So research on Dukascopy spot is validated on a *related*
instrument, not the same one. For a trend EMA the basis is minor; for anything spread- or
level-sensitive it is not.

**(b) Separate bid/ask feeds (Dukascopy m1).** Dukascopy logs a bid candle only when the
bid moved, an ask candle only when the ask moved → two feeds on different minute grids.
Forward-filling them independently fabricates `ask < bid` on ~42% of minutes (fictional
fills, fake returns). Fixed by using **tick** data (bid+ask already paired). Full writeup
in [dukascopy-data-issues.md](dukascopy-data-issues.md).

**(c) Last-trade vs bid/ask (IBKR history).** `get_price_history` returns **last-trade
OHLC only** — no historical bid/ask. So a GC backtest cannot measure the real spread from
history; we model it as a **fixed $0.30/oz** (from a live snapshot) split ±$0.15 into
synthetic bid/ask. Real GC spread *widens* in news/thin hours, so a fixed spread is
optimistic there.

**(d) Single contract vs continuous series.** Each GC contract only has data from its
listing date, and it expires. Our Tier-2 first pass uses **one** contract (Aug 2026,
hourly, 2025-11-20 → 2026-06-25). Its early bars are the *back* month — thinly traded
(volume in single digits) and not representative of front-month liquidity. A proper
multi-year backtest needs a **continuous front-month series** (Part 2.4).

**(e) Resolution mismatch.** Tier 1 = 1-minute spot; Tier 2 (so far) = 1-hour GC. Not yet
apples-to-apples — the 1-min GC continuous series is the expensive next step.

**(f) Delivery/access mismatch.** Spot XAUUSD has **no market-data subscription** on the
account (empty snapshot, no history); GC futures *are* accessible but **10-minute
delayed**. Fine for a historical backtest, not for live signals.

### 1.3 Takeaway

> The strategy code is the easy 10%. The 90% is making the data honest: paired quotes,
> complete coverage, the right instrument, and a continuous series. Most "amazing"
> backtests are data artifacts (we had a +1882% one), not edges.

---

## Part 2 — How GC gold futures work

A gold future is a standardized contract to exchange gold at a set price on a future date.
You don't pay the full value — you post **margin** and are marked to market daily. This is
where the leverage (and the risk) comes from.

### 2.1 Contract specs (measured + standard)

| | GC (standard) | MGC (E-micro) |
|---|---|---|
| Exchange | COMEX | COMEX |
| Size | **100 oz** | 10 oz |
| Tick | **$0.10/oz** = $10/contract | $0.10/oz = $1/contract |
| Notional @ $4,055 | **~$405,500** | ~$40,550 |
| Live spread (measured) | ~$0.30/oz = ~$30/contract | ~$0.30/oz = ~$3/contract |
| Use | full size | sizing on a small account |

(Measured live: GC Aug-2026 bid 4055.6 / ask 4055.9, open interest 273,569.)

### 2.2 Margin and leverage

You post **initial margin** (~$11–13k/contract for GC, exchange-set and volatility-
dependent), not the $405k notional → effective leverage **~30–35:1**. Each day the
position is **marked to market**: gains/losses move as cash (variation margin). Drop below
**maintenance margin** and IBKR auto-liquidates — there is no "ride it out." This is why
the spot backtest's 100:1 (and the ~3333:1 FX-pair bug) is fiction; ~33:1 is the ceiling.

### 2.3 Expiry and the active months

Gold futures list many months but liquidity concentrates in **Feb, Apr, Jun, Aug, Oct,
Dec**. Each contract has a **last trading date**; the most-liquid one is the **front
month**, and it stays front until ~days before expiry, when volume/open-interest **rolls**
to the next active month. (E.g. the Jun-2026 contract expired ~2026-06-26, so Aug-2026 is
now front.) A contract you hold to delivery obligates **physical** 100-oz gold — retail
traders always roll or close before that.

### 2.4 The continuous-contract problem (key for backtesting)

Because each contract is short-lived, a multi-year backtest needs a **continuous series**
stitched from successive front months:

1. **Roll rule** — switch from the expiring front to the next month on a trigger (N days
   before expiry, or when next-month volume/OI overtakes the front).
2. **Back-adjustment** — at each roll the two contracts trade at different prices (the
   *calendar spread*); splicing raw prices creates a fake gap/jump. Back-adjust (shift the
   older history by the roll gap) so the series is continuous and indicators aren't fooled.
3. **Cost of the roll** — in contango (below), rolling a long *costs* a little each time;
   a realistic backtest accounts for it.

Our current Tier-2 pass skips this (one contract) — fine for a smoke test, **not** for a
real result. Building the back-adjusted continuous series is the next data task.

### 2.5 Basis: how the future relates to spot

Futures price ≈ **spot + cost of carry** (financing + storage − lease rate). With positive
rates, gold is normally in mild **contango** (future > spot), converging to spot as expiry
approaches. Practical consequences:

- A GC backtest is **not** at the same price level as Dukascopy spot (basis differs, and
  it changes over the contract's life).
- Rolling a long position in contango is a small recurring drag — invisible if you backtest
  a single contract, real once you go continuous.

### 2.6 Costs (different from a CFD)

Unlike a CFD broker that bakes cost into a wide spread, futures cost = **tight spread
(~$0.30/oz) + commission per contract** (IBKR ~$2.5/contract is the order of magnitude;
fill in your actual schedule + exchange/reg fees). Financing isn't a separate swap line —
it's embedded in the futures price via the carry.

### 2.7 How this maps into the backtest

[backtest_gc.py](../backtest_gc.py) encodes the above:

- `FuturesContract`: multiplier **100**, price increment **0.1**, COMEX, `margin_init=0.03`
  (~33:1).
- Fixed **$0.30** synthetic spread (±$0.15) over last-trade OHLC, since IBKR history has no
  bid/ask.
- 1 contract on a $100k account; commission as a small per-notional `taker_fee` proxy.
- **Not yet modeled:** contract roll / continuous series, variable spread, basis. Those are
  the documented gaps before any GC number should be trusted.

---

## Part 3 — Audit: why the first GC result (+2.1%) is NOT trustworthy

A 21-agent adversarial audit (14 verified findings) on the coarse hourly pass. Documented
here because *understanding why a backtest lies* is the point of this repo. Ranked:

Ranked most-severe first; `[CRIT]` corrupts the headline number, `[DATA]` is the
data-quality lesson:

1. **[CRIT → FIXED] Zero-latency, same-bar-close fills.** All fills executed at the exact
   close that triggered the EMA cross. **Confirmed and fixed:** adding a realistic 100 ms
   `LatencyModel` flips **+2.1% → −30.4%** (win rate 50% → 37.5%) — the apparent edge was
   entirely this fill timing, not signal. Both [backtest.py](../backtest.py) and
   [backtest_gc.py](../backtest_gc.py) now carry the latency model (fills land on the next
   bar). Tier 1 moved −92.6% → −94.4%, same conclusion.
2. **[REFUTED — false positive] "Positions-report double-count."** The audit claimed summing
   the 15 `is_snapshot=True` rows plus the net row double-counts and that true realized is the
   net row alone (+$24,565). **Verified false:** the realized_pnl values are per-segment
   increments and the sum of all 16 rows equals the account's equity change *exactly*
   (+$2,075). The `is_snapshot=False` row alone is NOT the total. The original `pnl.sum()` and
   16-trade count were correct — no fix needed. (Lesson: audit the audit.)
3. **[DATA] Sample is statistical noise** — ~7 months, 16 round-trips, a single
   rally-then-selloff regime. Indistinguishable from chance.
4. **[DATA] Fixed $0.30 spread is optimistic** — real GC widens to $0.50–$2.00 around CPI /
   FOMC / NFP and in thin Asian/overnight hours, where several trades fire (00:00–06:00 UTC).
5. **[DATA] Hourly bar labeled at open but the wrangler treats it as a close**
   (`timestamp_is_close` default) — a 1-hour mis-stamp, and the collision that enables #1.
6. **[DATA] No execution latency or slippage modeled** — next-open gaps of $3–$24/contract
   show the omission is materially favorable.
7. **[DATA] Single far-dated contract, no roll** — early bars are thin back-month data; not
   a representative continuous series.
8. **[DATA] "Equity" is event-driven realized cash, not per-bar mark-to-market** — hides a
   ~78% peak-to-trough drawdown; the headline hinges on a forced last-bar liquidation.

**Medium / low:** single-price bars silently skipped (16% of the tape); commission is
percent-of-notional, not IBKR's flat ~$2.5/contract; buy&hold benchmark pays no costs;
fragile money-string parsing. **Verified CORRECT:** the margin model (3% → ~33×, no
double-count) and the NETTING flip mechanics.

**Verdict.** The original +2.1% was a costless artifact — with realistic latency the honest
number is **−30.4%** on a 16-trade noise sample: no evidence of edge. Note that **two of the
audit's findings were themselves wrong** (the "double-count" above, and a margin-liquidation
counterfactual), which is exactly why every finding was empirically re-verified — adversarial
review still produces false positives. What remains true and unfixed is the **data work**:
multi-year multi-regime GC history (not 7 months / 16 trades), a session/event-dependent
spread calibrated to real GC top-of-book, a continuous back-adjusted contract series, and
IBKR's flat per-contract commission — *then* ask whether a 50/200 EMA edge exists. The
strategy is the easy part; the data and fills are the work.
