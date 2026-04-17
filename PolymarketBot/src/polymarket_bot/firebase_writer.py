"""
Firebase Firestore integration for the Polymarket bot.

Writes TradeSignal results to /signals and manages /run_requests lifecycle.
Credentials are resolved in order:
  1. FIREBASE_CREDENTIALS_PATH env var → path to service account JSON
  2. GOOGLE_APPLICATION_CREDENTIALS env var (Application Default Credentials)
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

from polymarket_bot.strategies.base import MarketSnapshot, TradeSignal


def _init_app() -> None:
    if firebase_admin._apps:
        return
    cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
    if cred_path:
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    else:
        firebase_admin.initialize_app(credentials.ApplicationDefault())


class FirebaseWriter:
    """Read/write interface between the bot and Firestore."""

    def __init__(self) -> None:
        _init_app()
        self.db = firestore.client()

    # ------------------------------------------------------------------
    # Signals
    # ------------------------------------------------------------------

    def write_signal(
        self,
        request_id: str,
        strategy_name: str,
        snapshot: MarketSnapshot,
        signal: TradeSignal,
    ) -> None:
        """Append one TradeSignal result to the /signals collection."""
        self.db.collection("signals").add({
            "request_id":    request_id,
            "run_timestamp": datetime.now(timezone.utc),
            "strategy":      strategy_name,
            "condition_id":  snapshot.condition_id,
            "question":      snapshot.question,
            "action":        signal.action.value,
            "token_id":      signal.token_id,
            "price":         signal.price,
            "size_usd":      signal.size_usd,
            "edge":          signal.edge,
            "reason":        signal.reason,
            "yes_price":     snapshot.yes_price,
            "no_price":      snapshot.no_price,
            "spread":        snapshot.spread,
            "liquidity":     snapshot.liquidity,
        })

    # ------------------------------------------------------------------
    # Run requests
    # ------------------------------------------------------------------

    def get_pending_requests(self) -> list[dict]:
        """Return all run_requests documents with status == 'pending'."""
        docs = (
            self.db.collection("run_requests")
            .where("status", "==", "pending")
            .order_by("created_at")
            .limit(5)
            .stream()
        )
        return [{"id": d.id, **d.to_dict()} for d in docs]

    def update_request_status(
        self,
        request_id: str,
        status: str,
        *,
        signal_count: int | None = None,
        error: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        update: dict = {"status": status}

        if status == "running":
            update["started_at"] = now
        elif status in ("completed", "failed"):
            update["completed_at"] = now

        if signal_count is not None:
            update["signal_count"] = signal_count
        if error:
            update["error"] = error

        self.db.collection("run_requests").document(request_id).update(update)
