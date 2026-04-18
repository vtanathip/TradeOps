/**
 * Core types for Polymarket prediction market trading.
 *
 * Polymarket specifics:
 *   - Prices ARE probabilities (0.01–0.99); edge = your_estimate - market_price
 *   - Outcomes are binary — markets resolve to exactly 0.00 or 1.00
 *   - No shorting: buy the NO token instead (buy NO = short YES)
 */

export enum Action {
  BUY_YES = "BUY_YES",
  BUY_NO  = "BUY_NO",
  HOLD    = "HOLD",
  SKIP    = "SKIP",
}

export interface MarketSnapshot {
  readonly conditionId:  string;
  readonly question:     string;
  readonly yesTokenId:   string;
  readonly noTokenId:    string;
  readonly yesPrice:     number;
  readonly noPrice:      number;
  readonly yesBid:       number | null;
  readonly yesAsk:       number | null;
  readonly noBid:        number | null;
  readonly noAsk:        number | null;
  readonly spread:       number;
  readonly volume24h:    number | null;
  readonly liquidity:    number | null;
  readonly closesAt:     Date   | null;
}

export interface TradeSignal {
  action:  Action;
  tokenId: string;
  price:   number;
  sizeUsd: number;
  edge:    number;
  reason:  string;
}

export interface RiskConfig {
  bankrollUsd:     number;
  maxPositionUsd:  number;
  minEdge:         number;
  kellyFraction:   number;
  minLiquidityUsd: number;
  maxSpread:       number;
}

export function defaultRiskConfig(): RiskConfig {
  return {
    bankrollUsd:     1_000,
    maxPositionUsd:  100,
    minEdge:         0.04,
    kellyFraction:   0.25,
    minLiquidityUsd: 500,
    maxSpread:       0.05,
  };
}

// Matches the exact Firestore snake_case schema sent by the frontend
export interface RunConfig {
  strategy:         "fair_value" | "market_making";
  market_limit:     number;
  fair_prob?:       number;
  half_spread?:     number;
  tail_cutoff?:     number;
  resolution_days?: number;
  risk: {
    bankroll_usd:      number;
    max_position_usd:  number;
    min_edge:          number;
    kelly_fraction:    number;
    min_liquidity_usd: number;
    max_spread:        number;
  };
}
