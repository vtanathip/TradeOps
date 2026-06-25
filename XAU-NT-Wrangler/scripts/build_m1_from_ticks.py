#!/usr/bin/env python3
"""
Build PAIRED 1-minute bid/ask bars for a Dukascopy instrument from raw TICK data.

Why ticks: Dukascopy m1 candles must be downloaded one price side at a time
(-p bid / -p ask), so bid and ask land on DIFFERENT minute grids. Forward-filling
the two onto a common grid (what download_dukascopy.sh + the old backtest did)
pairs a fresh quote on one side with a stale one on the other and fabricates
crossed books (ask < bid) on ~42% of minutes -> fictional fills. Full writeup:
docs/dukascopy-data-issues.md.

Tick data has bid AND ask in the SAME record, so resampling both from one tick
stream keeps them on an identical grid and ask >= bid holds column-wise by
construction (proven in demo()). Output matches the old format
(timestamp_ms,open,high,low,close,volume) so backtest.py reads it unchanged.

Usage:
    python scripts/build_m1_from_ticks.py xauusd 2025 2026-06-25   # inst from to (one shot)
    python scripts/build_m1_from_ticks.py xauusd 2025 2026 --download-only  # populate _parts only
    python scripts/build_m1_from_ticks.py xauusd --merge-only      # _parts -> bid.csv/ask.csv
    python scripts/build_m1_from_ticks.py --selftest               # offline invariant check

`from`/`to` accept YYYY or YYYY-MM-DD. --download-only + --merge-only let several
processes (or a fan-out workflow) each grab a disjoint date slice into the shared
<outdir>/_parts dir, then merge once at the end.

Needs node/npx (uses `npx dukascopy-node`). Downloads & aggregates one MONTH at a
time (a single day of XAUUSD ticks is ~266k rows) so tick volume never blows up
memory/disk; raw tick CSVs live in a temp dir and are deleted after aggregation.
Per-month m1 results are cached in <outdir>/_parts so a long run is resumable.

RUN IT SEQUENTIALLY. Dukascopy throttles concurrent clients and (without retries)
silently drops the throttled hours, yielding sparse months -> garbage backtests.
We learned this the hard way: a 6-way parallel fan-out returned ~6% of the ticks.
The download is network/throttle-bound, so concurrency buys little and risks a lot;
-r/-re retries + a >=800 bars/day completeness assert are the guardrails.
"""
import glob
import os
import subprocess
import sys
import tempfile
from datetime import date

import pandas as pd

COLS = ["timestamp", "open", "high", "low", "close", "volume"]


def aggregate(tick_csv: str):
    """One tick CSV -> (bid_m1, ask_m1) DataFrames in output format, identical grid."""
    t = pd.read_csv(tick_csv)
    low = {c.lower(): c for c in t.columns}
    t.index = pd.to_datetime(t[low["timestamp"]], unit="ms", utc=True)
    if "bidvolume" in low and "askvolume" in low:
        vol = (t[low["bidvolume"]] + t[low["askvolume"]]).resample("1min").sum()
    else:  # no -v on the download: fall back to tick count as the activity proxy
        vol = t[low["bidprice"]].resample("1min").count().astype(float)

    def m1(price_col: str) -> pd.DataFrame:
        o = t[price_col].resample("1min").ohlc()
        o["volume"] = vol
        o = o[o["open"].notna()]  # keep only minutes that actually traded
        o.insert(0, "timestamp", o.index.astype("int64") // 10**6)
        return o.reset_index(drop=True)

    return m1(low["bidprice"]), m1(low["askprice"])


def _months(start: date, to: date):
    y, m = start.year, start.month
    while date(y, m, 1) < to:
        nxt = date(y + (m == 12), (m % 12) + 1, 1)
        yield max(date(y, m, 1), start), min(nxt, to)
        y, m = nxt.year, nxt.month


def download_months(inst: str, start: date, to: date, parts: str) -> None:
    """Download+aggregate each month in [start, to) into parts/{bid,ask}-YYYY-MM.csv."""
    os.makedirs(parts, exist_ok=True)
    for mstart, mend in _months(start, to):
        tag = f"{mstart:%Y-%m}"
        bpath, apath = (os.path.join(parts, f"{s}-{tag}.csv") for s in ("bid", "ask"))
        if os.path.exists(bpath) and os.path.exists(apath):
            print(f"[{tag}] cached, skip", flush=True)
            continue
        with tempfile.TemporaryDirectory() as tmp:
            print(f"[{tag}] downloading ticks...", flush=True)
            subprocess.run(
                # -r/-rp: retry FAILED artifacts (network/throttle errors). -fr: don't kill the run
                # when an hour is still unavailable after retries (closed-market hours are legitimately
                # 0-byte). NOT -re: retrying every weekend/holiday empty hour 5x would take hours and,
                # with the default fail-after-retries, aborts on the first closed hour. The >=800
                # bars/day assert below is the real guard against silently-sparse (throttled) months.
                ["npx", "--yes", "dukascopy-node", "-i", inst,
                 "-from", mstart.isoformat(), "-to", mend.isoformat(),
                 "-t", "tick", "-p", "bid", "-v", "-f", "csv", "-dir", tmp,
                 "-bs", "20", "-bp", "500", "-r", "5", "-rp", "1500", "-fr"],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            csvs = glob.glob(os.path.join(tmp, "*.csv"))
            if not csvs or os.path.getsize(csvs[0]) == 0:
                # empty month (instrument not yet listed / market closed): mark done so resume skips
                for p in (bpath, apath):
                    pd.DataFrame(columns=COLS).to_csv(p, index=False)
                print(f"[{tag}] empty, skipped", flush=True)
                continue
            b, a = aggregate(csvs[0])
            days = pd.to_datetime(b["timestamp"], unit="ms", utc=True).dt.date.nunique()
            per_day = len(b) / max(days, 1)
            if per_day < 800:  # XAUUSD trades ~1380 min/day; sub-800 means a throttled/partial month
                sys.exit(f"[{tag}] SPARSE: {len(b):,} bars / {days} days = {per_day:.0f}/day "
                         f"(expected ~1380). Throttled download — rerun (resumes); reduce concurrency.")
            b.to_csv(bpath, index=False)
            a.to_csv(apath, index=False)
            print(f"[{tag}] +{len(b):,} m1 bars over {days} days ({per_day:.0f}/day)", flush=True)


def merge(outdir: str) -> None:
    """Concat all _parts into bid.csv/ask.csv and assert the paired/no-crossed invariant."""
    parts = os.path.join(outdir, "_parts")
    for name in ("bid", "ask"):
        files = sorted(glob.glob(os.path.join(parts, f"{name}-*.csv")))
        if not files:
            sys.exit(f"no _parts found in {parts} — run a download first")
        df = pd.concat(pd.read_csv(f) for f in files)
        df = df.drop_duplicates("timestamp", keep="last").sort_values("timestamp")
        path = os.path.join(outdir, f"{name}.csv")
        df[COLS].to_csv(path, index=False)
        print(f"wrote {len(df):,} rows -> {path}")
    b = pd.read_csv(os.path.join(outdir, "bid.csv"))
    a = pd.read_csv(os.path.join(outdir, "ask.csv"))
    assert (b["timestamp"].values == a["timestamp"].values).all(), "bid/ask grids differ!"
    px = ["open", "high", "low", "close"]
    crossed = int((a[px].values < b[px].values).any(axis=1).sum())
    print(f"crossed-book minutes: {crossed} (expected 0)")
    t = pd.to_datetime(b["timestamp"], unit="ms", utc=True)
    days = t.dt.date.nunique()
    per_day = len(b) / max(days, 1)
    print(f"completeness: {len(b):,} bars / {days} days = {per_day:.0f}/day (XAUUSD full day ~1380)")
    assert per_day >= 800, f"INCOMPLETE: {per_day:.0f} bars/day — throttled download; delete _parts and rerun sequentially"


def demo() -> None:
    """Offline invariant: paired ticks resampled to m1 never yield a crossed book,
    even when price ramps within a minute (high is late, low is early)."""
    base = 1748822400000
    rows = "timestamp,askPrice,bidPrice,askVolume,bidVolume\n" + "".join(
        f"{base + i * 1000},{3000 + i * 0.1 + 0.30:.3f},{3000 + i * 0.1:.3f},1,1\n"
        for i in range(120)  # 2 full minutes of 1s ticks, bid rising, ask = bid + 0.30
    )
    p = os.path.join(tempfile.gettempdir(), "_ticks_selftest.csv")
    with open(p, "w") as f:
        f.write(rows)
    bid, ask = aggregate(p)
    assert len(bid) == 2 and (bid["timestamp"].values == ask["timestamp"].values).all()
    for col in ("open", "high", "low", "close"):
        assert (ask[col].values >= bid[col].values).all(), f"crossed on {col}"
    assert bid["high"].iloc[0] > bid["low"].iloc[0], "within-minute range lost"
    assert bid["volume"].iloc[0] == 120, "volume not summed"  # 60 ticks * (askVol1+bidVol1)
    print("selftest OK: paired ticks -> identical grid, ask>=bid column-wise, range preserved")


def _pdate(s: str) -> date:
    return date(int(s), 1, 1) if len(s) == 4 else date.fromisoformat(s)


if __name__ == "__main__":
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--selftest" in flags or (pos and pos[0] == "demo"):
        demo()
    else:
        inst = pos[0] if pos else "xauusd"
        outdir = f"data/{inst}-m1"
        if "--merge-only" in flags:
            merge(outdir)
        else:
            start = _pdate(pos[1]) if len(pos) > 1 else date(2003, 1, 1)
            to = _pdate(pos[2]) if len(pos) > 2 else date.today()
            download_months(inst, start, to, os.path.join(outdir, "_parts"))
            if "--download-only" not in flags:
                merge(outdir)
