"""
Strategy base types for Polymarket prediction market trading.

Polymarket differs from general trading in three key ways:
  1. Prices ARE probabilities (0.01–0.99) — edge = your_estimate - market_price
  2. Outcomes are binary — markets resolve to exactly 0.00 or 1.00 (NO or YES)
  3. No shorting syntax — you buy the opposite token instead (buy NO = short YES)

Position sizing uses the Kelly Criterion adapted for binary outcomes:
  f_yes* = (p - price) / (1 - price)   [buy YES when p > price]
  f_no*  = (price - p) / price          [buy NO  when p < price]
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


# ---------------------------------------------------------------------------
# Enums & core types
# ---------------------------------------------------------------------------

class Action(str, Enum):
    BUY_YES = "BUY_YES"   # We think YES is underpriced (our p > market price)
    BUY_NO  = "BUY_NO"    # We think NO  is underpriced (our p < market price)
    HOLD    = "HOLD"       # Already have a position; no new entry
    SKIP    = "SKIP"       # Not enough edge / bad market conditions


@dataclass(frozen=True)
class MarketSnapshot:
    """Everything a strategy needs to evaluate one market at a point in time."""

    condition_id: str
    question: str

    # Outcome token IDs (index 0 = YES, index 1 = NO by Polymarket convention)
    yes_token_id: str
    no_token_id: str

    # Mid-market prices (0.01 – 0.99); YES + NO should ≈ 1.0
    yes_price: float
    no_price: float

    # Top-of-book; None if book is empty on that side
    yes_bid: float | None = None
    yes_ask: float | None = None
    no_bid:  float | None = None
    no_ask:  float | None = None

    # Market metadata
    spread:      float         = 0.0
    volume_24h:  float | None  = None
    liquidity:   float | None  = None    # Total USDC in the order book
    closes_at:   datetime | None = None  # Resolution deadline


@dataclass
class TradeSignal:
    """Output of a strategy evaluation — what to do and why."""

    action:    Action
    token_id:  str    = ""     # Which token to buy (empty for HOLD/SKIP)
    price:     float  = 0.0    # Limit price to submit
    size_usd:  float  = 0.0    # Dollar notional (after Kelly + risk limits)
    edge:      float  = 0.0    # Raw edge = |our_p - market_price|
    reason:    str    = ""     # Human-readable rationale


# ---------------------------------------------------------------------------
# Risk configuration
# ---------------------------------------------------------------------------

@dataclass
class RiskConfig:
    """Portfolio-level risk guardrails applied by every strategy."""

    bankroll_usd:      float = 1_000.0   # Total capital available
    max_position_usd:  float = 100.0     # Hard cap per single market
    min_edge:          float = 0.04      # Minimum edge to trade (4 pp)
    kelly_fraction:    float = 0.25      # Fractional Kelly (0.25 = quarter-Kelly)
    min_liquidity_usd: float = 500.0     # Skip markets below this liquidity
    max_spread:        float = 0.05      # Skip markets with spread > this


# ---------------------------------------------------------------------------
# Kelly sizing helper
# ---------------------------------------------------------------------------

def kelly_size(
    our_prob: float,
    market_price: float,
    side: Action,
    config: RiskConfig,
) -> float:
    """
    Return a dollar position size using fractional Kelly for binary outcomes.

    Returns 0.0 when there is no positive edge so strategies can skip cleanly.
    """
    if side == Action.BUY_YES:
        if market_price >= 1.0:
            return 0.0
        f = (our_prob - market_price) / (1.0 - market_price)
    elif side == Action.BUY_NO:
        no_price = 1.0 - market_price
        if no_price >= 1.0:
            return 0.0
        f = ((1.0 - our_prob) - no_price) / (1.0 - no_price)
    else:
        return 0.0

    if f <= 0:
        return 0.0

    raw = config.bankroll_usd * config.kelly_fraction * f
    return min(raw, config.max_position_usd)


# ---------------------------------------------------------------------------
# Abstract base class
# ---------------------------------------------------------------------------

class Strategy(ABC):
    """
    Base class for all Polymarket trading strategies.

    Concrete strategies implement `evaluate()` to return a TradeSignal
    given a MarketSnapshot. The strategy should NOT place orders itself —
    the bot runner is responsible for execution.

    Typical flow:
        snapshot = build_snapshot(market, clob)
        signal   = strategy.evaluate(snapshot)
        if signal.action in (Action.BUY_YES, Action.BUY_NO):
            place_order(signal)
    """

    def __init__(self, config: RiskConfig | None = None) -> None:
        self.config = config or RiskConfig()

    @property
    def name(self) -> str:
        return self.__class__.__name__

    @abstractmethod
    def evaluate(self, snapshot: MarketSnapshot) -> TradeSignal:
        """
        Analyze the market and return a trading decision.

        Must always return a TradeSignal — use Action.SKIP when no trade
        is warranted rather than raising or returning None.
        """

    # ------------------------------------------------------------------
    # Shared pre-flight checks every strategy can call
    # ------------------------------------------------------------------

    def _passes_quality_checks(self, snapshot: MarketSnapshot) -> tuple[bool, str]:
        """Return (passes, reason) based on liquidity and spread filters."""
        if (
            snapshot.liquidity is not None
            and snapshot.liquidity < self.config.min_liquidity_usd
        ):
            return False, f"liquidity {snapshot.liquidity:.0f} < min {self.config.min_liquidity_usd:.0f}"

        if snapshot.spread > self.config.max_spread:
            return False, f"spread {snapshot.spread:.3f} > max {self.config.max_spread:.3f}"

        if snapshot.closes_at and snapshot.closes_at < datetime.utcnow():
            return False, "market already closed"

        return True, ""

    def _skip(self, reason: str) -> TradeSignal:
        return TradeSignal(action=Action.SKIP, reason=reason)
