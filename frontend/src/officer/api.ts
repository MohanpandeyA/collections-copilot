import { api } from "../api/client";

export type Band = "high" | "medium" | "low";
export type LoanRow = { loan_id: string; borrower_name: string; dpd: number; band: Band; score: number };
export type Reason = { code: string; text: string; contribution: number };
export type Promise_ = { state: "open" | "kept" | "broken"; promise_date: string; amount: string };
export type LoanDetail = {
  loan_id: string; borrower_name: string; phone: string; pincode: string;
  outstanding: string; dpd: number; last_payment_date: string | null;
  score: number; band: Band; reasons: Reason[]; promise: Promise_ | null;
};
export type ContactCheck = { allowed: boolean; block_reason: string | null };

export const fetchLoans = (token: string) => api<LoanRow[]>("/my/loans", "GET", { token });
export const fetchLoan = (token: string, id: string) =>
  api<LoanDetail>(`/my/loans/${encodeURIComponent(id)}`, "GET", { token });
export const checkCall = (token: string, loanId: string) =>
  api<ContactCheck>("/contact-attempts", "POST", { token, body: { loan_id: loanId, channel: "call" } });

/** Kept in its own function so tests can replace it. */
export function openDialer(phone: string): void {
  window.location.href = `tel:${phone}`;
}
