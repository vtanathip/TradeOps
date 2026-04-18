import { ClobClient } from "@polymarket/clob-client";
import { getMidpoint, getSpread, getOrderBook } from "../marketData";
import { MarketSnapshot } from "./types";

function toFloatOrNull(v: unknown): number | null {
  const n = parseFloat(String(v ?? ""));
  return isFinite(n) ? n : null;
}

/**
 * Build a MarketSnapshot from a Gamma API market dict + CLOB client.
 *
 * Returns null (with a warning) when market data is incomplete or API calls
 * fail, so the caller can safely skip rather than crash.
 */
export async function buildSnapshot(
  market: Record<string, unknown>,
  clob:   ClobClient,
): Promise<MarketSnapshot | null> {
  try {
    const conditionId = market["conditionId"] as string;
    const rawIds      = market["clobTokenIds"] as string | undefined;
    const tokenIds    = JSON.parse(rawIds ?? "[]") as string[];

    if (tokenIds.length < 2) {
      console.warn(`Market ${conditionId} has fewer than 2 tokens — skipping`);
      return null;
    }

    const [yesId, noId] = tokenIds;

    const [yesMidRaw, noMidRaw, spreadRaw] = await Promise.all([
      getMidpoint(clob, yesId),
      getMidpoint(clob, noId),
      getSpread(clob, yesId),
    ]);

    const yesPrice = parseFloat(yesMidRaw.mid    ?? "0.5");
    const noPrice  = parseFloat(noMidRaw.mid     ?? "0.5");
    const spread   = parseFloat(spreadRaw.spread ?? "0");

    let yesBid: number | null = null;
    let yesAsk: number | null = null;
    let noBid:  number | null = null;
    let noAsk:  number | null = null;

    try {
      const [yesBook, noBook] = await Promise.all([
        getOrderBook(clob, yesId),
        getOrderBook(clob, noId),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bids = (b: any) => b?.bids as Array<{ price: string }> | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asks = (b: any) => b?.asks as Array<{ price: string }> | undefined;
      if (bids(yesBook)?.[0]) yesBid = parseFloat(bids(yesBook)![0].price);
      if (asks(yesBook)?.[0]) yesAsk = parseFloat(asks(yesBook)![0].price);
      if (bids(noBook)?.[0])  noBid  = parseFloat(bids(noBook)![0].price);
      if (asks(noBook)?.[0])  noAsk  = parseFloat(asks(noBook)![0].price);
    } catch {
      // Top-of-book is optional; strategies fall back to mid price
    }

    let closesAt: Date | null = null;
    const endDate = (market["endDate"] ?? market["closedTime"]) as string | undefined;
    if (endDate) {
      const d = new Date(endDate.replace(/Z$/, ""));
      if (!isNaN(d.getTime())) closesAt = d;
    }

    return {
      conditionId,
      question:   (market["question"] as string) ?? "",
      yesTokenId: yesId,
      noTokenId:  noId,
      yesPrice,
      noPrice,
      yesBid,
      yesAsk,
      noBid,
      noAsk,
      spread,
      volume24h:  toFloatOrNull(market["volume24hr"] ?? market["volumeNum"]),
      liquidity:  toFloatOrNull(market["liquidity"]  ?? market["liquidityNum"]),
      closesAt,
    };
  } catch (err) {
    console.warn(`buildSnapshot failed for ${market["conditionId"] ?? "?"}: ${err}`);
    return null;
  }
}
