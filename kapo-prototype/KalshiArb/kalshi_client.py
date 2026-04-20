"""
kalshi_client.py — Thin HTTP client for Kalshi public market data.

Endpoint: GET https://trading-api.kalshi.com/trade-api/v2/markets/{ticker}

Auth notes:
  Kalshi v2 may require RSA-PKCS1-v1_5 signed requests for all endpoints.
  This client first tries a simple Bearer token (KALSHI_API_KEY from .env).
  If you receive 401, you must implement full RSA signing — see the README
  or Kalshi docs at https://trading-api.kalshi.com/docs#section/Authentication.
"""

from __future__ import annotations

from datetime import datetime

import requests
from loguru import logger
from pydantic import BaseModel, Field

from config import settings


KALSHI_BASE_URL = "https://trading-api.kalshi.com/trade-api/v2"


class KalshiMarket(BaseModel):
    ticker: str
    yes_bid: float = Field(default=0.0, description="Best YES bid as probability (0–1)")
    yes_ask: float = Field(default=0.0, description="Best YES ask as probability (0–1)")
    yes_price: float = Field(default=0.0, description="Mid price for YES (0–1)")
    no_bid: float = Field(default=0.0, description="Best NO bid as probability (0–1)")
    no_ask: float = Field(default=0.0, description="Best NO ask as probability (0–1)")
    status: str = Field(default="unknown")
    close_time: datetime | None = Field(default=None)


def _build_headers() -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if settings.kalshi_api_key:
        headers["Authorization"] = f"Bearer {settings.kalshi_api_key}"
    return headers


def _cents_to_prob(value: int | float | None) -> float:
    """Kalshi prices are integers 0–99 (cents). Normalise to 0.0–0.99."""
    if value is None:
        return 0.0
    return float(value) / 100.0


def fetch_market(ticker: str) -> KalshiMarket:
    """
    Fetch a single Kalshi market by ticker.

    Response shape (abbreviated):
      {"market": {"ticker": "...", "yes_bid": 45, "yes_ask": 47, ...}}

    Raises requests.HTTPError on non-2xx (including 401 if auth is needed).
    """
    url = f"{KALSHI_BASE_URL}/markets/{ticker}"
    logger.debug(f"GET {url}")

    resp = requests.get(url, headers=_build_headers(), timeout=10)
    resp.raise_for_status()

    raw = resp.json().get("market", {})

    yes_bid = _cents_to_prob(raw.get("yes_bid"))
    yes_ask = _cents_to_prob(raw.get("yes_ask"))
    no_bid  = _cents_to_prob(raw.get("no_bid"))
    no_ask  = _cents_to_prob(raw.get("no_ask"))
    last    = _cents_to_prob(raw.get("last_price"))

    yes_price = (yes_bid + yes_ask) / 2.0 if yes_bid > 0 and yes_ask > 0 else last

    close_time: datetime | None = None
    if ct := raw.get("close_time"):
        try:
            close_time = datetime.fromisoformat(ct.rstrip("Z"))
        except ValueError:
            logger.warning(f"Could not parse close_time: {ct!r}")

    return KalshiMarket(
        ticker=ticker,
        yes_bid=yes_bid,
        yes_ask=yes_ask,
        yes_price=yes_price,
        no_bid=no_bid,
        no_ask=no_ask,
        status=raw.get("status", "unknown"),
        close_time=close_time,
    )


def fetch_yes_bid(ticker: str) -> float:
    """Return the YES bid price in [0.0, 1.0]. Returns 0.0 on any error."""
    try:
        return fetch_market(ticker).yes_bid
    except Exception as exc:
        logger.error(f"fetch_yes_bid({ticker!r}) failed: {exc}")
        return 0.0
