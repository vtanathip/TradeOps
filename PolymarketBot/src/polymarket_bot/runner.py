"""
Polymarket bot runner — polls Firestore for run requests and executes strategies.

Start with:
    uv run polymarket-runner

The runner loops indefinitely. Each pending run_request document triggers:
  1. Pull config (strategy type, risk params, market limit)
  2. Fetch active markets from Polymarket
  3. Evaluate each market with the configured strategy
  4. Write each TradeSignal to Firestore /signals
  5. Mark the run_request as completed or failed
"""

from __future__ import annotations

import os
import time
import traceback

from dotenv import load_dotenv

from polymarket_bot.client import PolymarketClient
from polymarket_bot.firebase_writer import FirebaseWriter
from polymarket_bot.market_data import get_active_markets
from polymarket_bot.strategies import (
    FairValueStrategy,
    MarketMakingStrategy,
    RiskConfig,
    build_snapshot,
)

load_dotenv()

POLL_INTERVAL_SECONDS = 5


def _build_risk(cfg: dict) -> RiskConfig:
    r = cfg.get("risk", {})
    return RiskConfig(
        bankroll_usd=float(r.get("bankroll_usd", 1_000)),
        max_position_usd=float(r.get("max_position_usd", 100)),
        min_edge=float(r.get("min_edge", 0.04)),
        kelly_fraction=float(r.get("kelly_fraction", 0.25)),
        min_liquidity_usd=float(r.get("min_liquidity_usd", 500)),
        max_spread=float(r.get("max_spread", 0.05)),
    )


def _build_strategy(cfg: dict, risk: RiskConfig):
    name = cfg.get("strategy", "fair_value")
    if name == "fair_value":
        return FairValueStrategy(
            fair_prob=float(cfg.get("fair_prob", 0.60)),
            config=risk,
        )
    if name == "market_making":
        return MarketMakingStrategy(
            half_spread=float(cfg.get("half_spread", 0.02)),
            tail_cutoff=float(cfg.get("tail_cutoff", 0.05)),
            resolution_days=int(cfg.get("resolution_days", 3)),
            config=risk,
        )
    raise ValueError(f"Unknown strategy: {name!r}")


def execute_run(request_id: str, cfg: dict, writer: FirebaseWriter) -> int:
    """Run a single strategy scan and write results. Returns signal count."""
    risk      = _build_risk(cfg)
    strategy  = _build_strategy(cfg, risk)
    limit     = int(cfg.get("market_limit", 10))

    private_key = os.getenv("POLYMARKET_PRIVATE_KEY")
    client      = PolymarketClient(private_key=private_key)
    markets     = get_active_markets(limit=limit)

    count = 0
    for market in markets:
        snapshot = build_snapshot(market, client.clob)
        if snapshot is None:
            continue
        signal = strategy.evaluate(snapshot)
        writer.write_signal(request_id, strategy.name, snapshot, signal)
        count += 1

    return count


def main() -> None:
    writer = FirebaseWriter()
    print("Polymarket runner started — polling for run requests every "
          f"{POLL_INTERVAL_SECONDS}s. Press Ctrl+C to stop.\n")

    while True:
        try:
            pending = writer.get_pending_requests()
            for req in pending:
                request_id = req["id"]
                cfg        = req.get("config", {})
                print(f"[{request_id}] Starting — strategy={cfg.get('strategy')} "
                      f"markets={cfg.get('market_limit', 10)}")
                writer.update_request_status(request_id, "running")
                try:
                    count = execute_run(request_id, cfg, writer)
                    writer.update_request_status(request_id, "completed", signal_count=count)
                    print(f"[{request_id}] Completed — {count} signals written")
                except Exception as exc:
                    writer.update_request_status(request_id, "failed", error=str(exc))
                    traceback.print_exc()
        except Exception as exc:
            print(f"Polling error: {exc}")

        time.sleep(POLL_INTERVAL_SECONDS)
