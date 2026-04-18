import { ClobClient } from "@polymarket/clob-client";

const CLOB_HOST = "https://clob.polymarket.com";
const CHAIN_ID  = 137; // Polygon mainnet

export class PolymarketClient {
  readonly clob: ClobClient;

  private constructor(clob: ClobClient) {
    this.clob = clob;
  }

  /**
   * Create a read-only CLOB client for market data (no wallet required).
   *
   * Note: Order placement requires an authenticated client built with a
   * viem WalletClient or ethers Signer. The POLYMARKET_PRIVATE_KEY env var
   * is reserved for that future use case.
   */
  static create(): PolymarketClient {
    const client = new ClobClient(CLOB_HOST, CHAIN_ID);
    return new PolymarketClient(client);
  }
}
