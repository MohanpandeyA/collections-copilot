export type OutcomeResult = "paid" | "promise" | "unreachable" | "dispute";

export type QueuedOutcome = {
  client_id: string; // UUID made on the phone: the idempotency key
  loan_id: string;
  result: OutcomeResult;
  occurred_at: string; // device time; the server also stamps received_at
  lat: number | null;
  lng: number | null;
  note: string | null;
  promise_date: string | null;
  promise_amount: string | null;
  status: "pending" | "failed";
  reason: string | null; // why the server rejected it
};

/** Where the queue lives. IndexedDB in the app, memory in tests. */
export interface OutboxStore {
  all(): Promise<QueuedOutcome[]>;
  put(item: QueuedOutcome): Promise<void>;
  remove(clientId: string): Promise<void>;
}
