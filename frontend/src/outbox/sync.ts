import { api, ApiError } from "../api/client";
import type { OutboxStore, QueuedOutcome } from "./types";

type ItemResult = { client_id: string; status: "created" | "duplicate" | "rejected"; reason?: string | null };
export type Poster = (token: string, items: Record<string, unknown>[]) => Promise<ItemResult[]>;

const BATCH = 50; // matches the server limit

export const postBatch: Poster = async (token, items) =>
  (await api<{ results: ItemResult[] }>("/outcomes/batch", "POST", { token, body: { items } })).results;

const wire = ({ status: _s, reason: _r, ...rest }: QueuedOutcome) => rest;

export type SyncReport = { sent: number; failed: number; offline: boolean };

/**
 * Sends pending items, oldest first. Each item has its own result, so:
 *  created / duplicate -> remove (a duplicate means an earlier retry already landed)
 *  rejected            -> keep, marked failed with the reason, never retried blindly
 *  network error       -> keep everything pending and try again later
 */
export async function syncOutbox(store: OutboxStore, token: string, post: Poster = postBatch): Promise<SyncReport> {
  const pending = (await store.all()).filter((i) => i.status === "pending");
  const report: SyncReport = { sent: 0, failed: 0, offline: false };
  for (let at = 0; at < pending.length; at += BATCH) {
    const chunk = pending.slice(at, at + BATCH);
    let results: ItemResult[];
    try {
      results = await post(token, chunk.map(wire));
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) { report.offline = true; return report; }
      throw err; // 401 / 5xx: the caller decides; the queue is untouched
    }
    const byId = new Map(results.map((r) => [r.client_id, r]));
    for (const item of chunk) {
      const r = byId.get(item.client_id);
      if (!r) continue; // no answer for it: stays pending
      if (r.status === "rejected") {
        await store.put({ ...item, status: "failed", reason: r.reason ?? "rejected" });
        report.failed += 1;
      } else {
        await store.remove(item.client_id);
        report.sent += 1;
      }
    }
  }
  return report;
}
