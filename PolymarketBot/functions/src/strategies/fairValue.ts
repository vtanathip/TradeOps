import { Action, MarketSnapshot, RiskConfig, TradeSignal } from "./types";
import { Strategy }  from "./strategy";
import { kellySize } from "./kellySize";

/**
 * Trade when the market price diverges from our probability estimate.
 *
 * Buys YES when market is underpriced, buys NO when YES is overpriced,
 * subject to a minimum edge threshold.
 */
export class FairValueStrategy extends Strategy {
  private readonly fairProb: number;

  constructor(fairProb: number, config?: Partial<RiskConfig>) {
    super(config);
    if (fairProb <= 0 || fairProb >= 1) {
      throw new Error(`fairProb must be between 0 and 1, got ${fairProb}`);
    }
    this.fairProb = fairProb;
  }

  evaluate(snapshot: MarketSnapshot): TradeSignal {
    const [ok, reason] = this.passesQualityChecks(snapshot);
    if (!ok) return this.skip(reason);

    const yesPrice = snapshot.yesPrice;
    const edgeYes  = this.fairProb - yesPrice;
    const edgeNo   = yesPrice - this.fairProb;

    if (edgeYes >= this.config.minEdge) {
      const size = kellySize(this.fairProb, yesPrice, Action.BUY_YES, this.config);
      return {
        action:  Action.BUY_YES,
        tokenId: snapshot.yesTokenId,
        price:   snapshot.yesAsk ?? yesPrice,
        sizeUsd: size,
        edge:    edgeYes,
        reason:  `fair=${this.fairProb.toFixed(2)} market=${yesPrice.toFixed(2)} edge=${edgeYes.toFixed(3)}`,
      };
    }

    if (edgeNo >= this.config.minEdge) {
      const noPrice = snapshot.noPrice;
      const size = kellySize(this.fairProb, yesPrice, Action.BUY_NO, this.config);
      return {
        action:  Action.BUY_NO,
        tokenId: snapshot.noTokenId,
        price:   snapshot.noAsk ?? noPrice,
        sizeUsd: size,
        edge:    edgeNo,
        reason:  `fair=${this.fairProb.toFixed(2)} market=${yesPrice.toFixed(2)} edge=${edgeNo.toFixed(3)}`,
      };
    }

    return this.skip(
      `edge too small: yes_edge=${edgeYes.toFixed(3)} no_edge=${edgeNo.toFixed(3)} min=${this.config.minEdge.toFixed(3)}`,
    );
  }
}
