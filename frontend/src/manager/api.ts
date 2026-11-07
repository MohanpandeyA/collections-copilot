import { api } from "../api/client";

export type OfficerStat = { officer_id: number; officer_name: string; open_loans: number; cohort: number; rolled: number; rate: number | null };
export type Dashboard = {
  open_loans: number; overdue_amount: string; broken_promises: number; open_promises: number; snapshot_date: string | null;
  roll_rate: { cohort: number; rolled: number; rate: number | null }; by_officer: OfficerStat[];
};
export type PromiseRow = { loan_id: string; borrower_name: string; officer_name: string; promise_date: string; amount: string; state: "open" | "kept" | "broken" };
export type ActivityRow = { client_id: string; loan_id: string; borrower_name: string; officer_name: string; result: string; occurred_at: string; note: string | null };
export type ManagerLoan = { loan_id: string; borrower_name: string; officer_name: string; dpd: number; score: number; band: "high" | "medium" | "low"; rank: number | null };
export type ImportSummary = {
  batch_id: number; loaded: number; assigned: number; fallback_count: number; rejected_count: number;
  rejected: { row_number: number; loan_id: string; reason: string }[];
};

export const fetchDashboard = (t: string) => api<Dashboard>("/manager/dashboard", "GET", { token: t });
export const fetchPromises = (t: string, state: string) =>
  api<PromiseRow[]>(`/manager/promises${state ? `?state=${state}` : ""}`, "GET", { token: t });
export const sweepPromises = (t: string) => api<{ marked_broken: number }>("/manager/promises/sweep", "POST", { token: t });
export const fetchActivity = (t: string) => api<ActivityRow[]>("/manager/activity", "GET", { token: t });
export const fetchManagerLoans = (t: string) => api<ManagerLoan[]>("/manager/loans", "GET", { token: t });
export const setRank = (t: string, id: string, rank: number | null) =>
  api<unknown>(`/manager/loans/${encodeURIComponent(id)}/rank`, "PUT", { token: t, body: { rank } });
export const uploadCsv = (t: string, file: File) => api<ImportSummary>("/manager/imports", "POST", { token: t, file });
