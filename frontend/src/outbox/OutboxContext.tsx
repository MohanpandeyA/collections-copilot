import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { defaultStore } from "./stores";
import { syncOutbox, type Poster } from "./sync";
import type { OutboxStore, OutcomeResult, QueuedOutcome } from "./types";

export type NewOutcome = {
  loan_id: string; result: OutcomeResult; note?: string;
  promise_date?: string; promise_amount?: string; amount_received?: string; lat?: number | null; lng?: number | null;
};

type Ctx = {
  pending: number; failed: number; syncing: boolean;
  enqueue: (o: NewOutcome) => Promise<void>;
  syncNow: () => Promise<void>;
  items: QueuedOutcome[];
  dismiss: (clientId: string) => Promise<void>;
};
const OutboxCtx = createContext<Ctx | null>(null);

const RETRY_MS = [5_000, 15_000, 60_000, 300_000]; // back off while the network stays down

export function OutboxProvider({ children, store, post }: { children: ReactNode; store?: OutboxStore; post?: Poster }) {
  const { session, signOut } = useAuth();
  const s = useMemo(() => store ?? defaultStore(), [store]);
  const [items, setItems] = useState<QueuedOutcome[]>([]);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => setItems(await s.all()), [s]);

  const syncNow = useCallback(async () => {
    if (!session || busy.current) return;
    busy.current = true;
    setSyncing(true);
    clearTimeout(timer.current);
    try {
      const r = await syncOutbox(s, session.token, post);
      attempt.current = r.offline ? attempt.current + 1 : 0;
      if (r.offline) timer.current = setTimeout(() => void syncNow(), RETRY_MS[Math.min(attempt.current - 1, RETRY_MS.length - 1)]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signOut();
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [s, session, post, signOut, refresh]);

  useEffect(() => {
    void refresh().then(syncNow);
    const onOnline = () => { attempt.current = 0; void syncNow(); };
    window.addEventListener("online", onOnline);
    return () => { window.removeEventListener("online", onOnline); clearTimeout(timer.current); };
  }, [refresh, syncNow]);

  const enqueue = useCallback(async (o: NewOutcome) => {
    await s.put({
      client_id: crypto.randomUUID(), loan_id: o.loan_id, result: o.result,
      occurred_at: new Date().toISOString(), lat: o.lat ?? null, lng: o.lng ?? null,
      note: o.note?.trim() || null, promise_date: o.promise_date ?? null, promise_amount: o.promise_amount ?? null,
      amount_received: o.amount_received ?? null,
      status: "pending", reason: null,
    });
    await refresh();
    void syncNow();
  }, [s, refresh, syncNow]);

  const dismiss = useCallback(async (id: string) => { await s.remove(id); await refresh(); }, [s, refresh]);

  const value = useMemo<Ctx>(() => ({
    pending: items.filter((i) => i.status === "pending").length,
    failed: items.filter((i) => i.status === "failed").length,
    syncing, enqueue, syncNow, items, dismiss,
  }), [items, syncing, enqueue, syncNow, dismiss]);

  return <OutboxCtx.Provider value={value}>{children}</OutboxCtx.Provider>;
}

export function useOutbox(): Ctx {
  const c = useContext(OutboxCtx);
  if (!c) throw new Error("useOutbox needs OutboxProvider");
  return c;
}
