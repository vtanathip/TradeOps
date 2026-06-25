# Dukascopy data issues & why the backtest failed

A postmortem on the XAUUSD 1-minute backtest. The headline result was
**+1881.7%** ("beats buy & hold 14×"). It was **100% a data artifact**. With the
artifact removed the same strategy returns **−1079.8%**. This document explains
every issue, with hard, reproducible evidence.

**TL;DR** — Dukascopy publishes the bid feed and the ask feed as two *separate*,
*event-driven* candle streams on *different minute grids*. The backtest aligned
them with `union().ffill()`, which pairs a fresh quote on one side with a stale
quote on the other. On **42% of minutes** this produced a **crossed book**
(`ask < bid`) — impossible in a live market. The simulated exchange filled buy
orders *below the bid*, booking fictional free money on nearly every trade. That
fiction was the entire "edge."

---

## 1. What Dukascopy actually gives you

Three properties of the raw data drive every problem below:

1. **Bid and ask are separate files.** `download_dukascopy.sh` fetches `bid.csv`
   and `ask.csv` in independent runs (`-p bid`, `-p ask`). They are never
   guaranteed to share timestamps.
2. **Candles are event-driven, not clock-driven.** Dukascopy logs a *bid* candle
   only on minutes the bid moved, and an *ask* candle only on minutes the ask
   moved. Flat minutes are simply absent. So the two files land on **different
   minute grids**, and both have gaps.
3. **Timestamps label the OPEN of the minute.** `dukascopy-node` stamps each
   candle at the start of its period, not the close.

These are normal for tick-derived FX/metal data. The failure was in how we
*combined* the two feeds, not in the feeds themselves.

---

## 2. The critical failure — crossed-book fills from `ffill`

### The mechanism

To feed a backtest you need bid **and** ask at the same timestamps. The code
built a union grid and forward-filled each side independently
([backtest.py](../backtest.py)):

```python
idx = bid_raw.index.union(ask_raw.index)
bid = bid_raw.reindex(idx).ffill()   # carry last bid forward
ask = ask_raw.reindex(idx).ffill()   # carry last ask forward
```

Forward-fill means "repeat the last known price until it changes." Because the
two feeds tick on different minutes, at most timestamps **one side is fresh and
the other is a stale leftover**. When price moves fast and only the bid prints,
the bid jumps while the ask stays at an old value — and the ask ends up *below*
the bid:

```text
time    real bid   real ask     after independent ffill        spread
10:00     3375       3376        bid 3375  ask 3376              +1   ok
10:01     3375      (no print)   bid 3375  ask 3376 (carried)    +1   ok
10:02     3375      (no print)   bid 3375  ask 3376 (carried)    +1   ok
  ...price spikes, BID prints, ASK hasn't yet...
10:03     3384      (no print)   bid 3384  ask 3376 (STALE)      -8   IMPOSSIBLE
```

A crossed book (`ask < bid`) cannot exist live — nobody sells lower than someone
will buy. It is purely an artifact of gluing two out-of-sync feeds together.

### Why it detonates the backtest

The strategy buys at the ask and sells at the bid. On a crossed bar it **buys at
3376 while the real market is at 3384** — an instant, risk-free $8/oz that the
market never offered. Repeat on ~42% of bars across hundreds of trades and it
compounds into a fantasy return.

### Hard evidence

**(a) 42% of aligned minutes are crossed; the clean subset has zero.**

Forward-filled union grid vs. the exact-paired minutes (where *both* sides
actually printed in the same minute):

```text
ALIGNED bars (union+ffill): 2,238,243
  crossed (ask < bid):        942,533  = 42.1%
  min spread: -811.89   max spread: 514.727

PAIRED-ONLY minutes (inter): 252,242
  crossed:                    0
  min spread: 0.0       max spread: 5.98     mean 0.444  median 0.404
```

The real spread is 0–6 USD and never crossed. Every crossed bar is fabricated by
`ffill`. **In the default backtest window (2025-01-01 →), the mean ffilled
spread is actually −0.568 — negative on average.**

**(b) Caught in the act — buys filling below the bid.**

Sampling buy fills from a short run and comparing each fill price to the
prevailing book: **31 of 40 buys filled at or below the contemporaneous bid.**
Examples:

```text
buy @ 3365.852  | book bid 3375.005  ask 3365.852  spread -9.153
buy @ 3365.852  | book bid 3375.005  ask 3365.852  spread -9.496
```

The strategy bought ~$9/oz *under* the bid — $9,000+ of fictional profit per
1000-oz clip, hundreds of times.

**(c) Before / after — remove the fiction, the edge vanishes.**

Same window (2025-01-01 →), same strategy, only crossed-book minutes dropped:

| Metric          | Dirty (ffill crossed book) | Honest (crossed dropped) |
|-----------------|---------------------------:|-------------------------:|
| **Return**      |              **+1881.7%**  |          **−1079.8%**    |
| Realized PnL    |             +$18,817,214   |          −$10,797,701    |
| Win rate        |          50.7% (426/840)   |          16.5% (76/462)  |
| Avg PnL / trade |                 +$22,401   |             −$23,372     |
| Buy & hold      |                  +136.4%   |              +136.4%     |

The win rate falls from a coin-flip to 1-in-6 and the sign flips negative. There
was never an edge — the strategy was harvesting impossible spreads.

### The fix

Drop any minute whose ask candle dips below the bid candle on **any** of
open/high/low/close — we simply don't have a trustworthy two-sided quote there
([backtest.py](../backtest.py)):

```python
ohlc = ["open", "high", "low", "close"]
sane = (ask[ohlc].values >= bid[ohlc].values).all(axis=1)
bid, ask = bid[sane], ask[sane]
```

This removed **954,431 minutes (42.6%)** from the default window. Chosen over
*clamping* (`ask = max(ask, bid)`) because a clamped zero-spread is still
fiction — just less profitable fiction. The cleanest data of all is the
paired-only `inter` set, but it is too sparse (~252k minutes over 23 years) to
drive a 1-minute strategy.

---

## 3. Secondary Dukascopy-rooted issues

These did not create the fake return but make any result untrustworthy. Still
present in the code (not yet fixed):

### 3.1 Timestamp convention is backwards

`dukascopy-node` labels candles at the minute **open**. The code feeds those
labels to `BarDataWrangler.process` (no timestamp adjustment) and
`QuoteTickDataWrangler.process_bar_data` (`timestamp_is_close=True` by default,
which *assumes* the label is a close). Net effect: the whole feed runs ~1 minute
early and each bar's close is delivered at the *start* of its minute.

This is **not exploitable look-ahead** — the signal bar and its fill quote are
co-timestamped, and the fill cannot reach the bar's earlier high/low (those
ticks are stamped before the signal fires). But it is a real correctness bug:
any session boundary, time-of-day filter, or event-window logic would be off by
a minute. One-line fix: `df.index += pd.Timedelta(minutes=1)` at load.

### 3.2 Weekend / holiday gaps treated as continuous

Because candles only exist when price moved, the series has large gaps that the
EMA and the matching engine treat as one continuous step:

```text
gaps > 60 min: 2,145     gaps > 2 days: 1,173     max gap: 48 days
```

EMA(50/200) blends a Friday close straight into a Monday open; resting orders
are assumed fillable across a closed market.

### 3.3 The `volume` column is a tick-activity proxy, and it gets zeroed

Dukascopy "volume" for XAUUSD is tiny floats (~0.008) — a tick-count proxy, not
contract volume. Modeling gold as an FX pair (`size_precision=0`) rounds it to
**0**, so it is silently unusable as a liquidity/activity filter. The simulated
book also uses a fabricated depth of `size=1` while the strategy trades 1000
units, so fills incur no size-based slippage.

### 3.4 Downloader dedup is line-keyed, not timestamp-keyed

The merge step uses `sort -t, -k1,1n -u`, which dedups on the **whole line**, not
the timestamp. If two year-shards overlap and *disagree* on the same minute
(e.g. Dukascopy revises a candle), **both** rows survive as duplicate
timestamps; `load()` then `set_index`es a non-unique index and `reindex`/`ffill`
behavior becomes undefined. Currently latent (0 duplicate timestamps today), but
a trap for re-downloads. See [download_dukascopy.sh](../scripts/download_dukascopy.sh).

---

## 4. Reproduce the evidence yourself

```bash
# (a) crossed-spread census: union+ffill vs paired-only
.venv/bin/python - <<'PY'
import pandas as pd
def load(p):
    df = pd.read_csv(p); df["timestamp"]=pd.to_datetime(df["timestamp"],unit="ms",utc=True)
    return df.set_index("timestamp")[["open","high","low","close","volume"]]
b,a = load("data/xauusd-m1/bid.csv"), load("data/xauusd-m1/ask.csv")
idx=b.index.union(a.index); bb=b.reindex(idx).ffill(); aa=a.reindex(idx).ffill()
ok=bb["close"].notna()&aa["close"].notna(); bb,aa=bb[ok],aa[ok]
sp=aa["close"]-bb["close"]
print("aligned",len(bb)," crossed",int((sp<0).sum()),f"({(sp<0).mean():.1%})"," min",round(sp.min(),2))
inter=b.index.intersection(a.index); pp=a.loc[inter,"close"]-b.loc[inter,"close"]
print("paired ",len(inter)," crossed",int((pp<0).sum())," range",round(pp.min(),2),round(pp.max(),2))
PY

# (b) honest vs dirty: the fix is the crossed-book filter in backtest.py (lines 63-72); remove it to compare
.venv/bin/python backtest.py 2025-01-01
```

---

## 5. Bottom line

The data pipeline (Dukascopy download → spread-aware NautilusTrader) is sound.
The **alignment step** was the bug: independently forward-filling two
event-driven feeds manufactured crossed books that the engine turned into free
money. Fixed, the EMACross(50/200) demo does what a no-alpha trend follower does
against real spread and commission — it loses. The corrected sign is the honest
one.

> Note: the −1079.8% figure is itself *unrealistically bad* — the instrument is
> modeled at ~3333× effective leverage with no liquidation, so the account runs
> past zero instead of being margin-called. The point is the **direction and
> magnitude of the flip**, not the precise loss. A tradeable backtest still needs
> the §3 issues fixed and a realistic gold instrument.
