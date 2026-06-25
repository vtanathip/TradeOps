#!/usr/bin/env bash
# Parallel Dukascopy downloader: one dukascopy-node process per year, run N-at-a-time,
# then merged into a single timestamp-sorted, deduplicated CSV.
#
# Usage:  ./download_dukascopy.sh [instrument] [timeframe] [from_year] [to_date] [price] [concurrency]
# Default: ./download_dukascopy.sh xauusd m1 2003 <today> bid 6
#
# Examples:
#   ./download_dukascopy.sh                          # xauusd m1, 2003->today, bid, 6 parallel
#   ./download_dukascopy.sh eurusd m5 2010           # eurusd m5 from 2010
#   ./download_dukascopy.sh xauusd m1 2003 2026-06-25 ask 8
#
# Needs: node/npx (uses `npx dukascopy-node`). Per-year cache makes a failed year cheap to re-run.
# ponytail: xargs -P for the job pool (portable; no bash4 wait -n). Bump concurrency only if
#           Dukascopy tolerates it — too many parallel streams risks throttling.
set -euo pipefail

INSTRUMENT="${1:-xauusd}"
TIMEFRAME="${2:-m1}"
FROM_YEAR="${3:-2003}"
TO_DATE="${4:-$(date +%F)}"
PRICE="${5:-bid}"
CONC="${6:-6}"
TO_YEAR="${TO_DATE%%-*}"

ROOT="./data/${INSTRUMENT}-${TIMEFRAME}"
SHARDS="$ROOT/shards-${PRICE}"
CACHE="$ROOT/.cache-${PRICE}"
mkdir -p "$SHARDS" "$CACHE"

echo "Downloading $INSTRUMENT $TIMEFRAME ($PRICE)  ${FROM_YEAR}-01-01 .. ${TO_DATE}  [${CONC} parallel]"

# One shard per year. Final year is clamped to TO_DATE; others run to next-year Jan 1.
seq "$FROM_YEAR" "$TO_YEAR" | xargs -P "$CONC" -I{} sh -c '
  y=$1
  n=$((y + 1))
  end="${n}-01-01"
  [ "$n" -gt '"$TO_YEAR"' ] && end="'"$TO_DATE"'"
  echo "[start] $y -> $end"
  if npx --yes dukascopy-node -i '"$INSTRUMENT"' -from "${y}-01-01" -to "$end" \
       -t '"$TIMEFRAME"' -p '"$PRICE"' -f csv -v \
       -dir '"$SHARDS"' -ch -chpath "'"$CACHE"'/$y" -bs 20 -bp 300 >/dev/null 2>&1; then
    echo "[done]  $y"
  else
    echo "[FAIL]  $y"
  fi
' _ {}

# Merge: hardcoded header, all data rows, numeric sort by epoch-ms timestamp, dedup overlaps.
# Output is data/<instrument>-<tf>/<price>.csv  (e.g. data/xauusd-m1/bid.csv) — what backtest.py reads.
OUT="$ROOT/${PRICE}.csv"
echo "timestamp,open,high,low,close,volume" > "$OUT"
for f in "$SHARDS"/${INSTRUMENT}-${TIMEFRAME}-*.csv; do
  [ -s "$f" ] && tail -n +2 "$f"
done | sort -t, -k1,1n -u >> "$OUT"

ROWS=$(( $(wc -l < "$OUT") - 1 ))
echo "MERGED ${ROWS} rows -> ${OUT}"
[ "$ROWS" -gt 0 ] && echo "first: $(sed -n 2p "$OUT")" && echo "last:  $(tail -1 "$OUT")"
