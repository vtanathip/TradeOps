"""
Market Making strategy — earn the bid-ask spread by quoting both sides.

Instead of taking a directional view, a market maker provides liquidity by
posting limit orders on BOTH sides of the book, slightly inside the current
spread. The profit comes from the spread captured when both sides fill.

Polymarket-specific considerations:
  - Widen quotes as resolution approaches (gamma risk — price snaps to 0 or 1)
  - Tighten quotes on high-volume markets (more fill probability)
  - Skip markets near the tails (price < 0.05 or > 0.95) — asymmetric risk
  - The strategy returns TWO signals (one per side); the runner must submit both

Usage:
    strategy = MarketMakingStrategy(config=RiskConfig(bankroll_usd=2_000))
    bid_signal, ask_signal = strategy.evaluate_both(snapshot)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from .base import Action, MarketSnapshot, RiskConfig, Strategy, TradeSignal


@dataclass
class MakerQuotes:
    """Both sides of a market-making quote."""
    bid: TradeSignal   # BUY_YES limit order (our bid)
    ask: TradeSignal   # BUY_NO  limit order (our ask = offering YES to sellers)
    skipped: bool = False
    skip_reason: str = ""


class MarketMakingStrategy(Strategy):
    """
    Symmetric market-making strategy.

    Places limit orders on both sides of the YES token's order book,
    offset from mid by `half_spread`. The half-spread widens automatically
    when the market is close to resolution.

    Parameters
    ----------
    half_spread     : float  — minimum half-spread to quote, e.g. 0.02 = 2 cents
    tail_cutoff     : float  — skip markets where YES price < cutoff or > 1-cutoff
    resolution_days : int    — widen spread when fewer than this many days remain
    config          : RiskConfig
    """

    def __init__(
        self,
        half_spread: float = 0.02,
        tail_cutoff: float = 0.05,
        resolution_days: int = 3,
        config: RiskConfig | None = None,
    ) -> None:
        super().__init__(config)
        self.half_spread     = half_spread
        self.tail_cutoff     = tail_cutoff
        self.resolution_days = resolution_days

    # Strategy.evaluate() returns a single signal; use evaluate_both() for MM
    def evaluate(self, snapshot: MarketSnapshot) -> TradeSignal:
        """Returns the BUY_YES (bid) signal only. Use evaluate_both() for full MM."""
        quotes = self.evaluate_both(snapshot)
        return quotes.bid if not quotes.skipped else self._skip(quotes.skip_reason)

    def evaluate_both(self, snapshot: MarketSnapshot) -> MakerQuotes:
        ok, reason = self._passes_quality_checks(snapshot)
        if not ok:
            return MakerQuotes(
                bid=self._skip(reason), ask=self._skip(reason),
                skipped=True, skip_reason=reason,
            )

        mid = snapshot.yes_price

        # Avoid tail positions — near 0 or 1 the risk is highly asymmetric
        if mid < self.tail_cutoff or mid > (1.0 - self.tail_cutoff):
            r = f"price {mid:.3f} in tail (cutoff={self.tail_cutoff})"
            return MakerQuotes(bid=self._skip(r), ask=self._skip(r), skipped=True, skip_reason=r)

        half = self._adjusted_half_spread(snapshot)
        bid_price = round(max(0.01, mid - half), 2)
        ask_price = round(min(0.99, mid + half), 2)

        # Size each side equally; in practice you'd inventory-adjust
        side_size = min(self.config.max_position_usd * 0.5, self.config.bankroll_usd * 0.05)

        bid_signal = TradeSignal(
            action=Action.BUY_YES,
            token_id=snapshot.yes_token_id,
            price=bid_price,
            size_usd=side_size,
            edge=half,
            reason=f"MM bid mid={mid:.3f} half_spread={half:.3f}",
        )
        ask_signal = TradeSignal(
            action=Action.BUY_NO,
            token_id=snapshot.no_token_id,
            price=round(1.0 - ask_price, 2),   # NO price = 1 - YES ask
            size_usd=side_size,
            edge=half,
            reason=f"MM ask mid={mid:.3f} half_spread={half:.3f}",
        )
        return MakerQuotes(bid=bid_signal, ask=ask_signal)

    def _adjusted_half_spread(self, snapshot: MarketSnapshot) -> float:
        """Widen spread when resolution is imminent (gamma risk)."""
        half = self.half_spread
        if snapshot.closes_at:
            days_left = (snapshot.closes_at - datetime.utcnow()).total_seconds() / 86_400
            if days_left < self.resolution_days:
                # Linear widening: 2× spread in the final day, 1× at resolution_days out
                scale = 1.0 + (self.resolution_days - max(days_left, 0)) / self.resolution_days
                half = half * scale
        return round(half, 3)
