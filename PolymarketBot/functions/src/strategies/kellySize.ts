import { Action, RiskConfig } from "./types";

/**
 * Dollar position size using fractional Kelly for binary outcomes.
 *
 * Formula (binary market):
 *   BUY_YES:  f* = (p - price) / (1 - price)
 *   BUY_NO:   f* = ((1-p) - (1-price)) / (1 - (1-price))
 *
 * Returns 0 when there is no positive edge.
 */
export function kellySize(
  ourProb:     number,
  marketPrice: number,
  side:        Action,
  config:      RiskConfig,
): number {
  let f: number;

  if (side === Action.BUY_YES) {
    if (marketPrice >= 1) return 0;
    f = (ourProb - marketPrice) / (1 - marketPrice);
  } else if (side === Action.BUY_NO) {
    const noPrice = 1 - marketPrice;
    if (noPrice >= 1) return 0;
    f = ((1 - ourProb) - noPrice) / (1 - noPrice);
  } else {
    return 0;
  }

  if (f <= 0) return 0;
  return Math.min(config.bankrollUsd * config.kellyFraction * f, config.maxPositionUsd);
}
