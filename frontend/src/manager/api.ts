import { api } from "../api/client";

export type OfficerStat = { officer_id: number; officer_name: string; open_loans: number; cohort: number; rolled: number; rate: number | null };
export type Dashboard = {
  open_loans: number; overdue_amount: string; broken_promises: number; open_promises: number; snapshot_date: string | null;
  roll_rate: { cohort: number; rolled: number; rate: number | null }; by_officer: OfficerStat[];
};
export type PromiseRow = { loan_id: string; borrower_name: string; officer_name: string; promise_date: string; amount: string; state: "open" | "kept" | "broken" };
export type ActivityRow = { client_id: string; loan_id: string; borrower_name: string; officer_name: string; result: string; occurred_at: string; note: string | null; amount_received?: string | null };
export type ActivityPage = { items: ActivityRow[]; total: number; limit: number; offset: number };
export type Insights = {
  bands: { high: number; medium: number; low: number };
  overdue_by_age: { key: "b1" | "b2" | "b3" | "b4"; amount: string }[];
  promises: { open: number; kept: number; broken: number };
  visits_by_day: { day: string; count: number }[];
  result_mix: { paid: number; promise: number; unreachable: number; dispute: number };
  next_promises: PromiseRow[];
};
export type ManagerLoan = { loan_id: string; borrower_name: string; officer_name: string; dpd: number; outstanding: string; score: number; band: "high" | "medium" | "low"; rank: number | null };
export type ImportSummary = {
  batch_id: number; loaded: number; assigned: number; fallback_count: number; rejected_count: number; closed?: number;
  rejected: { row_number: number; loan_id: string; reason: string }[];
};

export const fetchDashboard = (t: string) => api<Dashboard>("/manager/dashboard", "GET", { token: t });
export const fetchPromises = (t: string, state: string) =>
  api<PromiseRow[]>(`/manager/promises${state ? `?state=${state}` : ""}`, "GET", { token: t });
export const sweepPromises = (t: string) => api<{ marked_broken: number }>("/manager/promises/sweep", "POST", { token: t });
export type ActivityQuery = { limit?: number; offset?: number; from?: string; to?: string };
export function fetchActivity(t: string, q: ActivityQuery = {}) {
  const p = new URLSearchParams();
  if (q.limit) p.set("limit", String(q.limit));
  if (q.offset) p.set("offset", String(q.offset));
  if (q.from) p.set("date_from", q.from);
  if (q.to) p.set("date_to", q.to);
  const qs = p.toString();
  return api<ActivityPage>(`/manager/activity${qs ? `?${qs}` : ""}`, "GET", { token: t });
}
export const fetchInsights = (t: string) => api<Insights>("/manager/insights", "GET", { token: t });
export const fetchManagerLoans = (t: string) => api<ManagerLoan[]>("/manager/loans", "GET", { token: t });
export const setRank = (t: string, id: string, rank: number | null) =>
  api<unknown>(`/manager/loans/${encodeURIComponent(id)}/rank`, "PUT", { token: t, body: { rank } });
export const uploadCsv = (t: string, file: File, closeMissing = false) =>
  api<ImportSummary>(`/manager/imports${closeMissing ? "?close_missing=true" : ""}`, "POST", { token: t, file });
