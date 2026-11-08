import type { Band, LoanRow } from "./api";

export function bandTotals(rows: LoanRow[]) {
  const out = { high: 0, medium: 0, low: 0 } as Record<Band, number>;
  for (const r of rows) out[r.band] += 1;
  return out;
}

export const totalOutstanding = (rows: LoanRow[]) => rows.reduce((sum, r) => sum + Number(r.outstanding || 0), 0);

export function filterVisits(rows: LoanRow[], band: Band | "", query: string) {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (!band || r.band === band) && (!q || r.borrower_name.toLowerCase().includes(q)));
}

/** 0 to 100, where 90 or more days overdue fills the bar. Only for the picture; the number beside it is exact. */
export const dpdFill = (dpd: number) => Math.min(Math.max(dpd, 0), 90) / 90 * 100;

/** Splits the list into loans still to visit and loans already logged today. Order inside each part is kept. */
export const splitVisited = (rows: LoanRow[]) => ({
  todo: rows.filter((r) => !r.visited_today),
  done: rows.filter((r) => r.visited_today),
});
