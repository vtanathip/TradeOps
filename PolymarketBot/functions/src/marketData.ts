import { ClobClient } from "@polymarket/clob-client";

const GAMMA_API = "https://gamma-api.polymarket.com";

export async function getActiveMarkets(
  limit  = 10,
  offset = 0,
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${GAMMA_API}/markets`);
  url.searchParams.set("active",  "true");
  url.searchParams.set("closed",  "false");
  url.searchParams.set("limit",   String(limit));
  url.searchParams.set("offset",  String(offset));

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Gamma API error: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<Record<string, unknown>[]>;
}

export async function getOrderBook(clob: ClobClient, tokenId: string) {
  return clob.getOrderBook(tokenId);
}

export async function getMidpoint(
  clob:    ClobClient,
  tokenId: string,
): Promise<{ mid: string }> {
  return clob.getMidpoint(tokenId) as Promise<{ mid: string }>;
}

export async function getSpread(
  clob:    ClobClient,
  tokenId: string,
): Promise<{ spread: string }> {
  return clob.getSpread(tokenId) as Promise<{ spread: string }>;
}
