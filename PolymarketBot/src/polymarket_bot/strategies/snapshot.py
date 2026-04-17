"""
Build a MarketSnapshot from live Polymarket API data.

Bridges the existing market_data.py functions into the typed MarketSnapshot
that all strategies expect.
"""

from __future__ import annotations

import json
import warnings
from datetime import datetime

from py_clob_client.client import ClobClient

from ..market_data import get_midpoint, get_order_book, get_spread
from .base import MarketSnapshot


def build_snapshot(market: dict, clob: ClobClient) -> MarketSnapshot | None:
    """
    Construct a MarketSnapshot from a Gamma API market dict + CLOB client.

    Returns None (with a warning) if the market data is incomplete or the
    API calls fail, so the caller can safely skip rather than crash.
    """
    try:
        condition_id  = market["conditionId"]
        token_ids     = json.loads(market.get("clobTokenIds", "[]"))
        if len(token_ids) < 2:
            warnings.warn(f"Market {condition_id} has fewer than 2 tokens — skipping")
            return None

        yes_id, no_id = token_ids[0], token_ids[1]

        yes_mid  = float(clob.get_midpoint(yes_id).get("mid", 0.5))
        no_mid   = float(clob.get_midpoint(no_id).get("mid", 0.5))
        spread   = float(clob.get_spread(yes_id).get("spread", 0.0))

        # Optional: top-of-book from the order book
        yes_bid = yes_ask = no_bid = no_ask = None
        try:
            yes_book = get_order_book(clob, yes_id)
            if yes_book.bids:
                yes_bid = float(yes_book.bids[0].price)
            if yes_book.asks:
                yes_ask = float(yes_book.asks[0].price)
            no_book = get_order_book(clob, no_id)
            if no_book.bids:
                no_bid = float(no_book.bids[0].price)
            if no_book.asks:
                no_ask = float(no_book.asks[0].price)
        except Exception:
            pass  # Top-of-book is optional; strategies fall back to mid

        closes_at = None
        if end_date := market.get("endDate") or market.get("closedTime"):
            try:
                closes_at = datetime.fromisoformat(end_date.rstrip("Z"))
            except ValueError:
                pass

        def _to_float(v: object) -> float | None:
            try:
                return float(v) if v is not None and v != "" else None
            except (TypeError, ValueError):
                return None

        return MarketSnapshot(
            condition_id=condition_id,
            question=market.get("question", ""),
            yes_token_id=yes_id,
            no_token_id=no_id,
            yes_price=yes_mid,
            no_price=no_mid,
            yes_bid=yes_bid,
            yes_ask=yes_ask,
            no_bid=no_bid,
            no_ask=no_ask,
            spread=spread,
            volume_24h=_to_float(market.get("volume24hr") or market.get("volumeNum")),
            liquidity=_to_float(market.get("liquidity") or market.get("liquidityNum")),
            closes_at=closes_at,
        )

    except Exception as exc:
        warnings.warn(f"build_snapshot failed for {market.get('conditionId', '?')}: {exc}")
        return None
