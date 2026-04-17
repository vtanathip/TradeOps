"""
Fair Value strategy — trade when the market price diverges from our probability estimate.

This is the most common Polymarket strategy: you form a view on the true probability
of an event (from your model, external data, news, etc.) and buy whichever token the
market is mispricing relative to that estimate.

Usage:
    strategy = FairValueStrategy(fair_prob=0.65, config=RiskConfig(bankroll_usd=500))
    signal   = strategy.evaluate(snapshot)
"""

from __future__ import annotations

from .base import Action, MarketSnapshot, RiskConfig, Strategy, TradeSignal, kelly_size


class FairValueStrategy(Strategy):
    """
    Single-market fair-value strategy.

    Provide your probability estimate for YES resolving (`fair_prob`).
    The strategy buys YES when market price is too low and buys NO
    when market price is too high — subject to a minimum edge threshold.

    Parameters
    ----------
    fair_prob : float
        Your estimated true probability of YES (0.0 – 1.0).
    config    : RiskConfig
        Risk and sizing parameters.
    """

    def __init__(self, fair_prob: float, config: RiskConfig | None = None) -> None:
        super().__init__(config)
        if not 0.0 < fair_prob < 1.0:
            raise ValueError(f"fair_prob must be between 0 and 1, got {fair_prob}")
        self.fair_prob = fair_prob

    def evaluate(self, snapshot: MarketSnapshot) -> TradeSignal:
        ok, reason = self._passes_quality_checks(snapshot)
        if not ok:
            return self._skip(reason)

        yes_price = snapshot.yes_price
        edge_yes  = self.fair_prob - yes_price   # positive → YES is cheap
        edge_no   = yes_price - self.fair_prob   # positive → NO  is cheap

        if edge_yes >= self.config.min_edge:
            size = kelly_size(self.fair_prob, yes_price, Action.BUY_YES, self.config)
            return TradeSignal(
                action=Action.BUY_YES,
                token_id=snapshot.yes_token_id,
                price=snapshot.yes_ask or yes_price,
                size_usd=size,
                edge=edge_yes,
                reason=f"fair={self.fair_prob:.2f} market={yes_price:.2f} edge={edge_yes:.3f}",
            )

        if edge_no >= self.config.min_edge:
            no_price = snapshot.no_price
            size = kelly_size(self.fair_prob, yes_price, Action.BUY_NO, self.config)
            return TradeSignal(
                action=Action.BUY_NO,
                token_id=snapshot.no_token_id,
                price=snapshot.no_ask or no_price,
                size_usd=size,
                edge=edge_no,
                reason=f"fair={self.fair_prob:.2f} market={yes_price:.2f} edge={edge_no:.3f}",
            )

        return self._skip(
            f"edge too small: yes_edge={edge_yes:.3f} no_edge={edge_no:.3f} min={self.config.min_edge:.3f}"
        )
