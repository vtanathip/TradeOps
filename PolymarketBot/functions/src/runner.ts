/**
 * Shared strategy execution logic + local development polling runner.
 *
 * executeRun() is exported and reused by both:
 *   - index.ts (Cloud Function Firestore trigger)
 *   - main() below (local polling runner: npm run runner)
 */

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { PolymarketClient }             from "./client";
import { FirebaseWriter }               from "./firebaseWriter";
import { getActiveMarkets }             from "./marketData";
import { buildSnapshot }                from "./strategies/snapshot";
import { FairValueStrategy }            from "./strategies/fairValue";
import { MarketMakingStrategy }         from "./strategies/marketMaking";
import { RiskConfig, RunConfig }        from "./strategies/types";

const POLL_INTERVAL_MS = 5_000;

function buildRiskConfig(cfg: RunConfig): Partial<RiskConfig> {
  const r = cfg.risk;
  return {
    bankrollUsd:     r.bankroll_usd,
    maxPositionUsd:  r.max_position_usd,
    minEdge:         r.min_edge,
    kellyFraction:   r.kelly_fraction,
    minLiquidityUsd: r.min_liquidity_usd,
    maxSpread:       r.max_spread,
  };
}

function buildStrategy(cfg: RunConfig, risk: Partial<RiskConfig>) {
  if (cfg.strategy === "market_making") {
    return new MarketMakingStrategy(
      cfg.half_spread     ?? 0.02,
      cfg.tail_cutoff     ?? 0.05,
      cfg.resolution_days ?? 3,
      risk,
    );
  }
  return new FairValueStrategy(cfg.fair_prob ?? 0.60, risk);
}

export async function executeRun(
  requestId: string,
  cfg:       Record<string, unknown>,
  writer:    FirebaseWriter,
): Promise<number> {
  const runCfg   = cfg as unknown as RunConfig;
  const risk     = buildRiskConfig(runCfg);
  const strategy = buildStrategy(runCfg, risk);
  const limit    = runCfg.market_limit ?? 10;

  const client  = PolymarketClient.create();
  const markets = await getActiveMarkets(limit);

  let count = 0;
  for (const market of markets) {
    const snapshot = await buildSnapshot(market, client.clob);
    if (!snapshot) continue;
    const signal = strategy.evaluate(snapshot);
    await writer.writeSignal(requestId, strategy.name, snapshot, signal);
    count++;
  }
  return count;
}

// ── Local development polling runner ──────────────────────────────────────────

function initFirebase(): void {
  if (getApps().length) return;
  const credPath = process.env["FIREBASE_CREDENTIALS_PATH"];
  if (credPath) {
    initializeApp({ credential: cert(credPath) });
  } else {
    initializeApp(); // Application Default Credentials
  }
}

async function main(): Promise<void> {
  // dotenv loaded by ts-node -r dotenv/config (see package.json runner script)
  initFirebase();
  const writer = new FirebaseWriter();
  console.log(`Polymarket runner started — polling every ${POLL_INTERVAL_MS / 1000}s. Ctrl+C to stop.\n`);

  const loop = async (): Promise<void> => {
    try {
      const pending = await writer.getPendingRequests();
      for (const req of pending) {
        const requestId = req["id"] as string;
        const cfg       = (req["config"] ?? {}) as Record<string, unknown>;
        console.log(`[${requestId}] Starting — strategy=${(cfg as unknown as RunConfig).strategy}`);
        await writer.updateRequestStatus(requestId, "running");
        try {
          const count = await executeRun(requestId, cfg, writer);
          await writer.updateRequestStatus(requestId, "completed", { signalCount: count });
          console.log(`[${requestId}] Completed — ${count} signals written`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await writer.updateRequestStatus(requestId, "failed", { error: msg });
          console.error(`[${requestId}] Failed:`, err);
        }
      }
    } catch (err) {
      console.error("Polling error:", err);
    }
    setTimeout(() => { void loop(); }, POLL_INTERVAL_MS);
  };

  await loop();
}

// Only run main() when this file is the entry point (not when imported by index.ts)
if (require.main === module) {
  main().catch(console.error);
}
