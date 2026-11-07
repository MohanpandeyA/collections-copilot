import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Bars, Donut, Ring, StackBar } from "../charts/Charts";
import type { ActivityRow, ManagerLoan } from "../manager/api";
import { bandCounts, filterLoans, overdueByAge, resultMix, visitsByDay } from "../manager/insights";

const loan = (o: Partial<ManagerLoan>): ManagerLoan => ({
  loan_id: "L-1", borrower_name: "Meena Devi", officer_name: "Rahul", dpd: 10, outstanding: "1000.00", score: 50, band: "medium", rank: null, ...o,
});

describe("chart components", () => {
  it("donut puts the real numbers in an accessible label and legend", () => {
    render(<Donut title="Loans by priority" centre={{ big: "5", small: "open loans" }} slices={[
      { key: "high", label: "High", value: 2, color: "red" }, { key: "low", label: "Low", value: 3, color: "green" },
    ]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Loans by priority: High 2, Low 3");
    expect(screen.getByText("open loans")).toBeInTheDocument();
  });

  it("donut legend buttons call onSelect with the slice key, and are disabled without it", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const slices = [{ key: "high", label: "High", value: 2, color: "red" }];
    const { rerender } = render(<Donut title="t" centre={{ big: "2", small: "x" }} slices={slices} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /High/ }));
    expect(onSelect).toHaveBeenCalledWith("high");
    rerender(<Donut title="t" centre={{ big: "2", small: "x" }} slices={slices} />);
    expect(screen.getByRole("button", { name: /High/ })).toBeDisabled();
  });

  it("donut with no data draws an empty ring instead of crashing", () => {
    render(<Donut title="t" centre={{ big: "0", small: "x" }} slices={[{ key: "a", label: "A", value: 0, color: "red" }]} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("bars show each label and value", () => {
    render(<Bars title="Age" bars={[{ key: "a", label: "1 to 30", value: 5, display: "₹5" }, { key: "b", label: "31 to 60", value: 0, display: "₹0" }]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Age: 1 to 30 ₹5, 31 to 60 ₹0");
  });

  it("stack bar lists every part, including zeros, in the legend", () => {
    render(<StackBar title="Promises" parts={[{ key: "o", label: "Open", value: 3, color: "a" }, { key: "k", label: "Kept", value: 0, color: "b" }]} />);
    expect(screen.getByText("Kept")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName("Promises: Open 3, Kept 0");
  });

  it("ring shows a dash when there is no rate", () => {
    render(<Ring percent={null} label="–" caption="Roll rate" />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Roll rate: –");
  });
});

describe("dashboard numbers", () => {
  it("puts each loan in exactly one age bucket and adds up the rupees", () => {
    const loans = [loan({ dpd: 1, outstanding: "100" }), loan({ dpd: 30, outstanding: "50" }), loan({ dpd: 31, outstanding: "10" }), loan({ dpd: 95, outstanding: "7" })];
    expect(overdueByAge(loans).map((b) => b.value)).toEqual([150, 10, 0, 7]);
  });

  it("counts loans by band", () => {
    expect(bandCounts([loan({ band: "high" }), loan({ band: "high" }), loan({ band: "low" })])).toEqual({ high: 2, medium: 0, low: 1 });
  });

  it("counts visits per IST day and gives empty days a zero", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    const row = (iso: string): ActivityRow => ({ client_id: iso, loan_id: "L", borrower_name: "B", officer_name: "O", result: "paid", occurred_at: iso, note: null });
    const days = visitsByDay([row("2026-11-07T05:00:00Z"), row("2026-11-07T06:00:00Z"), row("2026-11-05T05:00:00Z"), row("2026-10-01T05:00:00Z")], now, 7);
    expect(days).toHaveLength(7);
    expect(days[6].value).toBe(2);
    expect(days.find((d) => d.key === "2026-11-05")?.value).toBe(1);
    expect(days.reduce((a, d) => a + d.value, 0)).toBe(3);
  });

  it("a 23:30 IST visit counts for its IST day even though UTC has already moved on", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    const late: ActivityRow = { client_id: "x", loan_id: "L", borrower_name: "B", officer_name: "O", result: "paid", occurred_at: "2026-11-06T18:00:00Z", note: null };
    expect(visitsByDay([late], now, 3).find((d) => d.key === "2026-11-06")?.value).toBe(1);
    expect(visitsByDay([late], now, 3).find((d) => d.key === "2026-11-07")?.value).toBe(0);
  });

  it("a 00:30 IST visit belongs to the new IST day, not the previous UTC day", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    const late: ActivityRow = { client_id: "x", loan_id: "L", borrower_name: "B", officer_name: "O", result: "paid", occurred_at: "2026-11-06T19:00:00Z", note: null };
    expect(visitsByDay([late], now, 3).find((d) => d.key === "2026-11-06")?.value).toBe(0);
    expect(visitsByDay([late], now, 3).find((d) => d.key === "2026-11-07")?.value).toBe(1);
  });

  it("mixes results", () => {
    const r = (result: string) => ({ result }) as ActivityRow;
    expect(resultMix([r("paid"), r("paid"), r("dispute")])).toEqual({ paid: 2, promise: 0, unreachable: 0, dispute: 1 });
  });

  it("filters by band and by name, officer or loan number", () => {
    const loans = [loan({ loan_id: "L-1", band: "high" }), loan({ loan_id: "L-2", borrower_name: "Asha", officer_name: "Priya", band: "low" })];
    expect(filterLoans(loans, "high", "")).toHaveLength(1);
    expect(filterLoans(loans, "", "asha")[0].loan_id).toBe("L-2");
    expect(filterLoans(loans, "", "priya")).toHaveLength(1);
    expect(filterLoans(loans, "", "L-1")).toHaveLength(1);
    expect(filterLoans(loans, "high", "asha")).toHaveLength(0);
  });
});
