import type { Insights, ManagerLoan } from "./api";

export const AGE_BUCKETS = [
  { key: "b1", label: "1 to 30", min: 1, max: 30 },
  { key: "b2", label: "31 to 60", min: 31, max: 60 },
  { key: "b3", label: "61 to 90", min: 61, max: 90 },
  { key: "b4", label: "Over 90", min: 91, max: Infinity },
] as const;

const AGE_LABEL: Record<string, string> = Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, b.label]));
const IST_SHORT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/** The server counts everything; these only turn its numbers into chart bars. */
export const ageBars = (rows: Insights["overdue_by_age"]) =>
  rows.map((r) => ({ key: r.key, label: AGE_LABEL[r.key] ?? r.key, value: Number(r.amount) }));

export const dayBars = (rows: Insights["visits_by_day"]) =>
  rows.map((r) => ({ key: r.day, label: IST_SHORT.format(new Date(`${r.day}T12:00:00+05:30`)), value: r.count }));

export function filterLoans(loans: ManagerLoan[], band: string, query: string) {
  const q = query.trim().toLowerCase();
  return loans.filter((l) => (!band || l.band === band) && (!q || l.borrower_name.toLowerCase().includes(q) || l.officer_name.toLowerCase().includes(q) || l.loan_id.toLowerCase().includes(q)));
}
