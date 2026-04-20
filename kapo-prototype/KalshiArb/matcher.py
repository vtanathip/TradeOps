"""
matcher.py — Fuzzy matching between Kalshi tickers and Polymarket markets.

Uses the Gamma REST API for Polymarket market discovery and rapidfuzz
for question-string similarity. Raw Kalshi tickers (e.g. "KXBTC-25APR-T60000")
score poorly against natural-language Polymarket questions — WRatio works best
when tickers embed recognizable tokens (BTC, ETH, USD, etc.). For known pairs,
consider a manual override dict before falling back to fuzzy matching.
"""

from __future__ import annotations

import requests
from loguru import logger
from rapidfuzz import fuzz, process


GAMMA_API = "https://gamma-api.polymarket.com"
MATCH_SCORE_THRESHOLD = 75


def fetch_polymarket_markets(
    limit: int = 100,
    active_only: bool = True,
) -> list[dict]:
    """
    Fetch active markets from the Gamma REST API.

    Returns a list of dicts, each with at minimum:
      conditionId, question, outcomes, clobTokenIds

    For >100 markets, call with increasing offset and concatenate results.
    """
    params: dict = {"limit": limit}
    if active_only:
        params["active"] = "true"
        params["closed"] = "false"

    logger.debug(f"Fetching Polymarket markets (limit={limit})")
    try:
        resp = requests.get(f"{GAMMA_API}/markets", params=params, timeout=15)
        resp.raise_for_status()
        markets: list[dict] = resp.json()
        logger.info(f"Fetched {len(markets)} Polymarket markets")
        return markets
    except Exception as exc:
        logger.error(f"fetch_polymarket_markets failed: {exc}")
        return []


def match_ticker_to_market(
    kalshi_ticker: str,
    polymarket_markets: list[dict],
    score_threshold: int = MATCH_SCORE_THRESHOLD,
) -> dict | None:
    """
    Fuzzy-match a Kalshi ticker against Polymarket market questions.

    Returns a dict with {conditionId, question, clobTokenIds, outcomes, score}
    or None if no match meets the threshold.
    """
    if not polymarket_markets:
        return None

    question_map: dict[str, dict] = {
        m.get("question", "").strip(): m
        for m in polymarket_markets
        if m.get("question", "").strip()
    }

    result = process.extractOne(
        kalshi_ticker,
        list(question_map.keys()),
        scorer=fuzz.WRatio,
        score_cutoff=score_threshold,
    )

    if result is None:
        logger.debug(f"No match for {kalshi_ticker!r} (threshold={score_threshold})")
        return None

    matched_question, score, _ = result
    market = question_map[matched_question]
    logger.info(f"Matched {kalshi_ticker!r} -> {matched_question!r} (score={score:.1f})")

    return {
        "conditionId":  market.get("conditionId", ""),
        "question":     matched_question,
        "clobTokenIds": market.get("clobTokenIds", "[]"),
        "outcomes":     market.get("outcomes", "[]"),
        "score":        score,
    }


def build_match_table(
    kalshi_tickers: list[str],
    polymarket_markets: list[dict] | None = None,
) -> list[dict]:
    """
    Batch-match all Kalshi tickers to Polymarket markets.

    Fetches markets automatically if polymarket_markets is None (one API call
    shared across all tickers).

    Returns:
      [{"kalshi_ticker", "polymarket_condition_id", "question", "score"}, ...]
    """
    if polymarket_markets is None:
        polymarket_markets = fetch_polymarket_markets()

    rows: list[dict] = []
    for ticker in kalshi_tickers:
        match = match_ticker_to_market(ticker, polymarket_markets)
        rows.append({
            "kalshi_ticker":           ticker,
            "polymarket_condition_id": match["conditionId"] if match else None,
            "question":                match["question"]    if match else None,
            "score":                   match["score"]       if match else None,
        })

    return rows
