import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { MarketSnapshot, TradeSignal } from "./strategies/types";

export class FirebaseWriter {
  private readonly db = getFirestore();

  async writeSignal(
    requestId:    string,
    strategyName: string,
    snapshot:     MarketSnapshot,
    signal:       TradeSignal,
  ): Promise<void> {
    await this.db.collection("signals").add({
      request_id:    requestId,
      run_timestamp: FieldValue.serverTimestamp(),
      strategy:      strategyName,
      condition_id:  snapshot.conditionId,
      question:      snapshot.question,
      action:        signal.action,
      token_id:      signal.tokenId,
      price:         signal.price,
      size_usd:      signal.sizeUsd,
      edge:          signal.edge,
      reason:        signal.reason,
      yes_price:     snapshot.yesPrice,
      no_price:      snapshot.noPrice,
      spread:        snapshot.spread,
      liquidity:     snapshot.liquidity,
    });
  }

  async getPendingRequests(): Promise<Array<Record<string, unknown> & { id: string }>> {
    const snap = await this.db
      .collection("run_requests")
      .where("status", "==", "pending")
      .orderBy("created_at")
      .limit(5)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async updateRequestStatus(
    requestId: string,
    status:    "running" | "completed" | "failed",
    extras?:   { signalCount?: number; error?: string },
  ): Promise<void> {
    const now    = FieldValue.serverTimestamp();
    const update: Record<string, unknown> = { status };

    if (status === "running")                          update["started_at"]   = now;
    if (status === "completed" || status === "failed") update["completed_at"] = now;
    if (extras?.signalCount != null)                   update["signal_count"] = extras.signalCount;
    if (extras?.error)                                 update["error"]        = extras.error;

    await this.db.collection("run_requests").doc(requestId).update(update);
  }
}
