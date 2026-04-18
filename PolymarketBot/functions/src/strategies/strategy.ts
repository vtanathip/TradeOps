import { Action, MarketSnapshot, RiskConfig, TradeSignal, defaultRiskConfig } from "./types";

export abstract class Strategy {
  protected readonly config: RiskConfig;

  constructor(config?: Partial<RiskConfig>) {
    this.config = { ...defaultRiskConfig(), ...config };
  }

  get name(): string {
    return this.constructor.name;
  }

  abstract evaluate(snapshot: MarketSnapshot): TradeSignal;

  protected passesQualityChecks(s: MarketSnapshot): [boolean, string] {
    if (s.liquidity !== null && s.liquidity < this.config.minLiquidityUsd) {
      return [false, `liquidity ${s.liquidity.toFixed(0)} < min ${this.config.minLiquidityUsd.toFixed(0)}`];
    }
    if (s.spread > this.config.maxSpread) {
      return [false, `spread ${s.spread.toFixed(3)} > max ${this.config.maxSpread.toFixed(3)}`];
    }
    if (s.closesAt && s.closesAt < new Date()) {
      return [false, "market already closed"];
    }
    return [true, ""];
  }

  protected skip(reason: string): TradeSignal {
    return { action: Action.SKIP, tokenId: "", price: 0, sizeUsd: 0, edge: 0, reason };
  }
}
