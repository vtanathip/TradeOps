import { Action, MarketSnapshot, RiskConfig, TradeSignal } from "./types";
import { Strategy } from "./strategy";

export interface MakerQuotes {
  bid:        TradeSignal;
  ask:        TradeSignal;
  skipped:    boolean;
  skipReason: string;
}

/**
 * Symmetric market-making strategy — earn the bid-ask spread.
 *
 * Quotes both sides of the YES token's order book, offset from mid by
 * half_spread. The spread widens automatically near resolution (gamma risk).
 * Skips markets near the tails (price < tailCutoff or > 1 - tailCutoff).
 */
export class MarketMakingStrategy extends Strategy {
  private readonly halfSpread:     number;
  private readonly tailCutoff:     number;
  private readonly resolutionDays: number;

  constructor(
    halfSpread     = 0.02,
    tailCutoff     = 0.05,
    resolutionDays = 3,
    config?: Partial<RiskConfig>,
  ) {
    super(config);
    this.halfSpread     = halfSpread;
    this.tailCutoff     = tailCutoff;
    this.resolutionDays = resolutionDays;
  }

  evaluate(snapshot: MarketSnapshot): TradeSignal {
    const quotes = this.evaluateBoth(snapshot);
    return quotes.skipped ? this.skip(quotes.skipReason) : quotes.bid;
  }

  evaluateBoth(snapshot: MarketSnapshot): MakerQuotes {
    const [ok, reason] = this.passesQualityChecks(snapshot);
    if (!ok) {
      return { bid: this.skip(reason), ask: this.skip(reason), skipped: true, skipReason: reason };
    }

    const mid = snapshot.yesPrice;

    if (mid < this.tailCutoff || mid > 1 - this.tailCutoff) {
      const r = `price ${mid.toFixed(3)} in tail (cutoff=${this.tailCutoff})`;
      return { bid: this.skip(r), ask: this.skip(r), skipped: true, skipReason: r };
    }

    const half     = this.adjustedHalfSpread(snapshot);
    const bidPrice = Math.round(Math.max(0.01, mid - half) * 100) / 100;
    const askPrice = Math.round(Math.min(0.99, mid + half) * 100) / 100;
    const sideSize = Math.min(this.config.maxPositionUsd * 0.5, this.config.bankrollUsd * 0.05);

    return {
      bid: {
        action:  Action.BUY_YES,
        tokenId: snapshot.yesTokenId,
        price:   bidPrice,
        sizeUsd: sideSize,
        edge:    half,
        reason:  `MM bid mid=${mid.toFixed(3)} half_spread=${half.toFixed(3)}`,
      },
      ask: {
        action:  Action.BUY_NO,
        tokenId: snapshot.noTokenId,
        price:   Math.round((1 - askPrice) * 100) / 100,
        sizeUsd: sideSize,
        edge:    half,
        reason:  `MM ask mid=${mid.toFixed(3)} half_spread=${half.toFixed(3)}`,
      },
      skipped:    false,
      skipReason: "",
    };
  }

  private adjustedHalfSpread(snapshot: MarketSnapshot): number {
    let half = this.halfSpread;
    if (snapshot.closesAt) {
      const daysLeft = (snapshot.closesAt.getTime() - Date.now()) / 86_400_000;
      if (daysLeft < this.resolutionDays) {
        const scale = 1 + (this.resolutionDays - Math.max(daysLeft, 0)) / this.resolutionDays;
        half = half * scale;
      }
    }
    return Math.round(half * 1000) / 1000;
  }
}
