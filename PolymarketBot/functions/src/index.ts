import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp }     from "firebase-admin/app";
import { executeRun }        from "./runner";
import { FirebaseWriter }    from "./firebaseWriter";

initializeApp();

/**
 * Fires whenever a new document is created in /run_requests.
 * Replaces the Python polling runner — no separate server needed.
 */
export const onRunRequest = onDocumentCreated(
  {
    document:       "run_requests/{requestId}",
    timeoutSeconds: 300,
    memory:         "512MiB",
    secrets:        ["POLYMARKET_PRIVATE_KEY"],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data      = snap.data() as Record<string, unknown>;
    const requestId = event.params.requestId;

    // Guard: only handle fresh pending documents (avoids re-processing on retries)
    if (data["status"] !== "pending") return;

    const writer = new FirebaseWriter();
    await writer.updateRequestStatus(requestId, "running");

    try {
      const cfg   = (data["config"] ?? {}) as Record<string, unknown>;
      const count = await executeRun(requestId, cfg, writer);
      await writer.updateRequestStatus(requestId, "completed", { signalCount: count });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await writer.updateRequestStatus(requestId, "failed", { error: msg });
      throw err; // re-throw so Cloud Functions marks the invocation as failed
    }
  },
);
