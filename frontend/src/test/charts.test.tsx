import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Bars, Donut, Ring, StackBar } from "../charts/Charts";
import type { ManagerLoan } from "../manager/api";
import { ageBars, dayBars, filterLoans } from "../manager/insights";

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
  it("turns the server's age buckets into labelled bars in order, as numbers", () => {
    const bars = ageBars([{ key: "b1", amount: "150.00" }, { key: "b2", amount: "10.00" }, { key: "b3", amount: "0" }, { key: "b4", amount: "7.50" }]);
    expect(bars.map((b) => [b.label, b.value])).toEqual([["1 to 30", 150], ["31 to 60", 10], ["61 to 90", 0], ["Over 90", 7.5]]);
  });

  it("labels each visit day with its own IST date and keeps the zero days", () => {
    const bars = dayBars([{ day: "2026-11-05", count: 0 }, { day: "2026-11-06", count: 3 }, { day: "2026-11-07", count: 1 }]);
    expect(bars.map((b) => [b.key, b.label, b.value])).toEqual([["2026-11-05", "5 Nov", 0], ["2026-11-06", "6 Nov", 3], ["2026-11-07", "7 Nov", 1]]);
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
