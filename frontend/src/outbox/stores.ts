import type { OutboxStore, QueuedOutcome } from "./types";

export function memoryStore(): OutboxStore {
  const rows = new Map<string, QueuedOutcome>();
  return {
    all: async () => [...rows.values()].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    put: async (i) => { rows.set(i.client_id, i); },
    remove: async (id) => { rows.delete(id); },
  };
}

const DB = "cc-outbox";
const TABLE = "outcomes";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE, { keyPath: "client_id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function wrap<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(TABLE, mode).objectStore(TABLE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export function indexedDbStore(): OutboxStore {
  return {
    all: async () => ((await wrap("readonly", (s) => s.getAll())) as QueuedOutcome[])
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    put: async (i) => { await wrap("readwrite", (s) => s.put(i)); },
    remove: async (id) => { await wrap("readwrite", (s) => s.delete(id)); },
  };
}

/** IndexedDB when the browser has it, otherwise memory so the app still works (queue is lost on reload). */
export function defaultStore(): OutboxStore {
  return typeof indexedDB === "undefined" ? memoryStore() : indexedDbStore();
}
