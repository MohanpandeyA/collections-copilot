import type { ActivityRow, ManagerLoan, PromiseRow } from "./api";

export const AGE_BUCKETS = [
  { key: "b1", label: "1 to 30", min: 1, max: 30 },
  { key: "b2", label: "31 to 60", min: 31, max: 60 },
  { key: "b3", label: "61 to 90", min: 61, max: 90 },
  { key: "b4", label: "Over 90", min: 91, max: Infinity },
] as const;

/** Rupees overdue per age bucket. A loan lands in exactly one bucket. */
export function overdueByAge(loans: ManagerLoan[]) {
  return AGE_BUCKETS.map((b) => ({
    key: b.key, label: b.label,
    value: loans.filter((l) => l.dpd >= b.min && l.dpd <= b.max).reduce((sum, l) => sum + Number(l.outstanding), 0),
  }));
}

export function bandCounts(loans: ManagerLoan[]) {
  return { high: loans.filter((l) => l.band === "high").length, medium: loans.filter((l) => l.band === "medium").length, low: loans.filter((l) => l.band === "low").length };
}

export function promiseCounts(rows: PromiseRow[]) {
  return { open: rows.filter((p) => p.state === "open").length, kept: rows.filter((p) => p.state === "kept").length, broken: rows.filter((p) => p.state === "broken").length };
}

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const IST_SHORT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
export const istDay = (d: Date) => IST_DAY.format(d);

/** Visits per day for the last `days` days, in IST, oldest first. Days with no visits show as 0. */
export function visitsByDay(rows: ActivityRow[], now: Date, days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    out.push({ key: istDay(d), label: IST_SHORT.format(d), value: 0 });
  }
  const index = new Map(out.map((o) => [o.key, o]));
  for (const r of rows) {
    const slot = index.get(istDay(new Date(r.occurred_at)));
    if (slot) slot.value += 1;
  }
  return out;
}

export function resultMix(rows: ActivityRow[]) {
  const mix = { paid: 0, promise: 0, unreachable: 0, dispute: 0 };
  for (const r of rows) if (r.result in mix) mix[r.result as keyof typeof mix] += 1;
  return mix;
}

export function filterLoans(loans: ManagerLoan[], band: string, query: string) {
  const q = query.trim().toLowerCase();
  return loans.filter((l) => (!band || l.band === band) && (!q || l.borrower_name.toLowerCase().includes(q) || l.officer_name.toLowerCase().includes(q) || l.loan_id.toLowerCase().includes(q)));
}
