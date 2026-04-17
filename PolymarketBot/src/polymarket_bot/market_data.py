from __future__ import annotations

import httpx
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import BookParams

GAMMA_API = "https://gamma-api.polymarket.com"


def get_active_markets(limit: int = 10, offset: int = 0) -> list[dict]:
    """Fetch active markets from the Gamma REST API (no auth required)."""
    resp = httpx.get(
        f"{GAMMA_API}/markets",
        params={"active": "true", "closed": "false", "limit": limit, "offset": offset},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def get_market_detail(clob: ClobClient, condition_id: str) -> dict:
    """Fetch single market detail from CLOB (includes tick size, neg_risk)."""
    return clob.get_market(condition_id)


def get_order_book(clob: ClobClient, token_id: str):
    """Fetch the order book for a given outcome token (returns OrderBookSummary)."""
    return clob.get_order_book(token_id)


def get_order_books(clob: ClobClient, token_ids: list[str]) -> list:
    """Fetch order books for multiple outcome tokens in one call."""
    params = [BookParams(token_id=tid) for tid in token_ids]
    return clob.get_order_books(params)


def get_midpoint(clob: ClobClient, token_id: str) -> dict:
    """Return the mid-market price (average of best bid and ask)."""
    return clob.get_midpoint(token_id)


def get_spread(clob: ClobClient, token_id: str) -> dict:
    """Return the bid-ask spread for a token."""
    return clob.get_spread(token_id)


def get_last_trade_price(clob: ClobClient, token_id: str) -> dict:
    """Return the most recent trade price for a token."""
    return clob.get_last_trade_price(token_id)
