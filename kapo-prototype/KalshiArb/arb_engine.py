"""
arb_engine.py — Main arbitrage scanning loop (paper trading only).

No real orders are placed. Every observation is logged to SQLite (trades.db).

CLOB midpoint endpoint (public, no auth):
  GET https://clob.polymarket.com/midpoint?token_id={token_id}
  Response: {"mid": "0.47"}
"""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone

import requests
from loguru import logger

from config import WATCH_TICKERS
from kalshi_client import fetch_yes_bid
from matcher import build_match_table, fetch_polymarket_markets


CLOB_BASE_URL = "https://clob.polymarket.com"
POLL_INTERVAL_SECONDS = 60
SPREAD_THRESHOLD = 0.03      # 3 pp — below this is noise
VIRTUAL_TRADE_SIZE_USD = 100.0

# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS virtual_trades (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp                TEXT    NOT NULL,
    kalshi_ticker            TEXT,
    polymarket_condition_id  TEXT,
    kalshi_yes_bid           REAL,
    polymarket_yes_price     REAL,
    spread_pct               REAL,
    action                   TEXT,
    virtual_size_usd         REAL,
    match_score              REAL,
    notes                    TEXT
)
"""


def init_db(path: str = "trades.db") -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute(_SCHEMA)
    conn.commit()
    logger.info(f"SQLite ready: {path}")
    return conn


def log_trade(conn: sqlite3.Connection, trade: dict) -> None:
    conn.execute(
        """
        INSERT INTO virtual_trades (
            timestamp, kalshi_ticker, polymarket_condition_id,
            kalshi_yes_bid, polymarket_yes_price, spread_pct,
            action, virtual_size_usd, match_score, notes
        ) VALUES (
            :timestamp, :kalshi_ticker, :polymarket_condition_id,
            :kalshi_yes_bid, :polymarket_yes_price, :spread_pct,
            :action, :virtual_size_usd, :match_score, :notes
        )
        """,
        {
            "timestamp":               trade.get("timestamp", _utcnow()),
            "kalshi_ticker":           trade.get("kalshi_ticker"),
            "polymarket_condition_id": trade.get("polymarket_condition_id"),
            "kalshi_yes_bid":          trade.get("kalshi_yes_bid"),
            "polymarket_yes_price":    trade.get("polymarket_yes_price"),
            "spread_pct":              trade.get("spread_pct"),
            "action":                  trade.get("action"),
            "virtual_size_usd":        trade.get("virtual_size_usd"),
            "match_score":             trade.get("match_score"),
            "notes":                   trade.get("notes"),
        },
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Signal logic
# ---------------------------------------------------------------------------

def calculate_spread(kalshi_bid: float, poly_price: float) -> float:
    """(kalshi_bid - poly_price) / poly_price. Returns 0.0 if poly_price is zero."""
    if poly_price <= 0.0:
        return 0.0
    return (kalshi_bid - poly_price) / poly_price


def evaluate_signal(spread: float, threshold: float = SPREAD_THRESHOLD) -> str:
    """
    spread > +threshold -> 'BUY_YES'  (Kalshi asks more; buy YES cheaper on Poly)
    spread < -threshold -> 'BUY_NO'   (Poly asks more; buy NO on Poly)
    otherwise           -> 'HOLD'
    """
    if spread > threshold:
        return "BUY_YES"
    if spread < -threshold:
        return "BUY_NO"
    return "HOLD"


# ---------------------------------------------------------------------------
# Polymarket CLOB helpers
# ---------------------------------------------------------------------------

def _fetch_poly_midpoint(token_id: str) -> float | None:
    try:
        resp = requests.get(
            f"{CLOB_BASE_URL}/midpoint",
            params={"token_id": token_id},
            timeout=10,
        )
        resp.raise_for_status()
        mid = resp.json().get("mid")
        return float(mid) if mid is not None else None
    except Exception as exc:
        logger.warning(f"Poly midpoint fetch failed for token {token_id!r}: {exc}")
        return None


def _first_yes_token(clob_token_ids_json: str) -> str | None:
    try:
        ids = json.loads(clob_token_ids_json)
        return ids[0] if ids else None
    except (json.JSONDecodeError, IndexError):
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    if not WATCH_TICKERS:
        logger.error(
            "WATCH_LIST is empty. Add comma-separated Kalshi tickers to .env.\n"
            "Example: WATCH_LIST=KXBTC-25APR-T60000,KXETH-25APR-T3000"
        )
        return

    conn = init_db()
    logger.info(f"Arb engine started. Watching: {WATCH_TICKERS}")
    logger.info(f"Poll: {POLL_INTERVAL_SECONDS}s | Threshold: {SPREAD_THRESHOLD*100:.0f}pp")

    try:
        while True:
            tick_start = time.monotonic()
            logger.info(f"--- Tick @ {_utcnow()} ---")

            poly_markets = fetch_polymarket_markets(limit=100)
            match_table = build_match_table(WATCH_TICKERS, polymarket_markets=poly_markets)

            for row in match_table:
                ticker  = row["kalshi_ticker"]
                cond_id = row["polymarket_condition_id"]
                score   = row["score"]

                kalshi_bid = fetch_yes_bid(ticker)

                poly_price: float | None = None
                if cond_id:
                    matched = next(
                        (m for m in poly_markets if m.get("conditionId") == cond_id),
                        None,
                    )
                    if matched:
                        yes_token = _first_yes_token(matched.get("clobTokenIds", "[]"))
                        if yes_token:
                            poly_price = _fetch_poly_midpoint(yes_token)

                spread = calculate_spread(kalshi_bid, poly_price or 0.0)
                action = evaluate_signal(spread)

                notes: list[str] = []
                if kalshi_bid == 0.0:
                    notes.append("kalshi_bid=0 (error or closed)")
                if poly_price is None:
                    notes.append("poly_price=None (no match or CLOB error)")

                log_trade(conn, {
                    "timestamp":               _utcnow(),
                    "kalshi_ticker":           ticker,
                    "polymarket_condition_id": cond_id,
                    "kalshi_yes_bid":          kalshi_bid,
                    "polymarket_yes_price":    poly_price,
                    "spread_pct":              spread,
                    "action":                  action,
                    "virtual_size_usd":        VIRTUAL_TRADE_SIZE_USD if action != "HOLD" else 0.0,
                    "match_score":             score,
                    "notes":                   "; ".join(notes) or None,
                })

                logger.info(
                    f"  {ticker:<30} K={kalshi_bid:.3f} "
                    f"P={poly_price or 0.0:.3f} "
                    f"spread={spread*100:+.1f}pp -> {action}"
                )

            elapsed = time.monotonic() - tick_start
            sleep_for = max(0.0, POLL_INTERVAL_SECONDS - elapsed)
            logger.debug(f"Tick done in {elapsed:.1f}s. Sleeping {sleep_for:.1f}s.")
            time.sleep(sleep_for)

    except KeyboardInterrupt:
        logger.info("Stopped by user.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
