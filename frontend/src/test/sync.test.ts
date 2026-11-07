import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { memoryStore } from "../outbox/stores";
import { syncOutbox } from "../outbox/sync";
import type { QueuedOutcome } from "../outbox/types";

const item = (id: string, at = "2026-11-07T05:00:00Z"): QueuedOutcome => ({
  client_id: id, loan_id: "L-1", result: "paid", occurred_at: at, lat: null, lng: null,
  note: null, promise_date: null, promise_amount: null, status: "pending", reason: null,
});

async function storeWith(...items: QueuedOutcome[]) {
  const s = memoryStore();
  for (const i of items) await s.put(i);
  return s;
}

describe("syncOutbox", () => {
  it("removes created and duplicate items", async () => {
    const s = await storeWith(item("a"), item("b"));
    const post = vi.fn().mockResolvedValue([{ client_id: "a", status: "created" }, { client_id: "b", status: "duplicate" }]);
    const r = await syncOutbox(s, "tok", post);
    expect(r).toEqual({ sent: 2, failed: 0, offline: false });
    expect(await s.all()).toEqual([]);
  });

  it("keeps a rejected item as failed with the reason, and still clears the good one", async () => {
    const s = await storeWith(item("a"), item("b"));
    const post = vi.fn().mockResolvedValue([{ client_id: "a", status: "created" }, { client_id: "b", status: "rejected", reason: "not your loan" }]);
    const r = await syncOutbox(s, "tok", post);
    expect(r.failed).toBe(1);
    expect(await s.all()).toMatchObject([{ client_id: "b", status: "failed", reason: "not your loan" }]);
  });

  it("does not resend failed items", async () => {
    const s = await storeWith({ ...item("a"), status: "failed", reason: "x" });
    const post = vi.fn();
    await syncOutbox(s, "tok", post);
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps everything pending when offline", async () => {
    const s = await storeWith(item("a"));
    const r = await syncOutbox(s, "tok", vi.fn().mockRejectedValue(new ApiError(0, "network")));
    expect(r.offline).toBe(true);
    expect(await s.all()).toMatchObject([{ client_id: "a", status: "pending" }]);
  });

  it("rethrows server errors and leaves the queue alone", async () => {
    const s = await storeWith(item("a"));
    await expect(syncOutbox(s, "tok", vi.fn().mockRejectedValue(new ApiError(500, "boom")))).rejects.toThrow();
    expect(await s.all()).toHaveLength(1);
  });

  it("sends oldest first, in batches of 50, without UI-only fields", async () => {
    const many = Array.from({ length: 120 }, (_, i) => item(`id${String(i).padStart(3, "0")}`, `2026-11-07T05:${String(i % 60).padStart(2, "0")}:00Z`));
    const s = await storeWith(...many);
    const post = vi.fn().mockImplementation(async (_t, items) => items.map((i: { client_id: string }) => ({ client_id: i.client_id, status: "created" })));
    await syncOutbox(s, "tok", post);
    expect(post.mock.calls.map((c) => c[1].length)).toEqual([50, 50, 20]);
    expect(post.mock.calls[0][1][0]).not.toHaveProperty("status");
    expect(await s.all()).toEqual([]);
  });

  it("leaves an item pending if the server gave no answer for it", async () => {
    const s = await storeWith(item("a"), item("b"));
    await syncOutbox(s, "tok", vi.fn().mockResolvedValue([{ client_id: "a", status: "created" }]));
    expect(await s.all()).toMatchObject([{ client_id: "b", status: "pending" }]);
  });
});
