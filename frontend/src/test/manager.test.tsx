import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSession } from "../auth/session";
import { json, mockFetch, renderApp } from "./render";

const DASH = {
  open_loans: 12, overdue_amount: "250000.00", broken_promises: 2, open_promises: 3, snapshot_date: "2026-11-01",
  roll_rate: { cohort: 8, rolled: 2, rate: 25.0 },
  by_officer: [{ officer_id: 1, officer_name: "Rahul", open_loans: 6, cohort: 4, rolled: 1, rate: 25.0 }],
};
const LOANS = [{ loan_id: "L-1", borrower_name: "Meena Devi", officer_name: "Rahul", dpd: 62, score: 81, band: "high", rank: null }];

beforeEach(() => saveSession({ token: "tok", role: "manager", language: "en" }));
afterEach(() => vi.unstubAllGlobals());

describe("manager dashboard", () => {
  it("shows the headline numbers and roll rate with its working", async () => {
    mockFetch(() => json(DASH));
    renderApp("/manager");
    expect(await screen.findByText("₹2,50,000")).toBeInTheDocument();
    const roll = screen.getByRole("region", { name: "Roll rate" });
    expect(within(roll).getByText("25%")).toBeInTheDocument();
    expect(within(roll).getByText(/2 of 8/)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Rahul" })).toBeInTheDocument();
  });

  it("says so when the month start group is empty instead of showing 0%", async () => {
    mockFetch(() => json({ ...DASH, roll_rate: { cohort: 0, rolled: 0, rate: null }, snapshot_date: null }));
    renderApp("/manager");
    expect(await screen.findByText("No loans in the month start group yet")).toBeInTheDocument();
  });

  it("shows an error with a working retry", async () => {
    let fail = true;
    mockFetch(() => (fail ? json({ detail: "x" }, 500) : json(DASH)));
    const user = userEvent.setup();
    renderApp("/manager");
    const retry = await screen.findByRole("button", { name: "Try again" });
    fail = false;
    await user.click(retry);
    expect(await screen.findByText("₹2,50,000")).toBeInTheDocument();
  });

  it("navigates between sections", async () => {
    mockFetch((url) => (url.endsWith("/manager/dashboard") ? json(DASH) : json([])));
    const user = userEvent.setup();
    renderApp("/manager");
    await user.click(await screen.findByRole("link", { name: "Activity" }));
    expect(await screen.findByText("No visits logged yet")).toBeInTheDocument();
  });
});

describe("csv import", () => {
  const file = (name = "overdue.csv") => new File(["loan_id\nL1"], name, { type: "text/csv" });

  it("keeps upload disabled until a file is chosen, then shows the summary and rejected rows", async () => {
    const f = mockFetch(() => json({ batch_id: 1, loaded: 9, assigned: 9, fallback_count: 2, rejected_count: 1, rejected: [{ row_number: 4, loan_id: "L-X", reason: "dpd must be a number" }] }));
    const user = userEvent.setup();
    renderApp("/manager/import");
    const btn = await screen.findByRole("button", { name: "Upload and assign" });
    expect(btn).toBeDisabled();
    await user.upload(screen.getByLabelText("Choose CSV file"), file());
    await user.click(btn);
    expect(await screen.findByText("Import finished")).toBeInTheDocument();
    expect(screen.getByText(/Loaded: 9/)).toBeInTheDocument();
    expect(screen.getByText("dpd must be a number")).toBeInTheDocument();
    const [, init] = f.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("shows a clear error when the server refuses the file", async () => {
    mockFetch(() => json({ detail: "missing columns" }, 422));
    const user = userEvent.setup();
    renderApp("/manager/import");
    await user.upload(await screen.findByLabelText("Choose CSV file"), file());
    await user.click(screen.getByRole("button", { name: "Upload and assign" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
  });
});

describe("promise tracker", () => {
  const ROWS = [{ loan_id: "L-1", borrower_name: "Meena Devi", officer_name: "Rahul", promise_date: "2026-11-01", amount: "5000.00", state: "broken" }];

  it("lists promises, filters by state through the API, and shows an empty state", async () => {
    const f = mockFetch((url) => (url.includes("state=kept") ? json([]) : json(ROWS)));
    const user = userEvent.setup();
    renderApp("/manager/promises");
    expect(await screen.findByText("Meena Devi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kept" }));
    expect(await screen.findByText("No promises here")).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => String(u).includes("/manager/promises?state=kept"))).toBe(true);
  });

  it("the sweep button calls the API, reports the count, and reloads", async () => {
    const f = mockFetch((url) => (url.endsWith("/sweep") ? json({ marked_broken: 3 }) : json(ROWS)));
    const user = userEvent.setup();
    renderApp("/manager/promises");
    await user.click(await screen.findByRole("button", { name: "Mark overdue promises as broken" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Marked as broken: 3");
    await waitFor(() => expect(f.mock.calls.filter(([u]) => String(u).endsWith("/manager/promises")).length).toBeGreaterThanOrEqual(2));
  });
});

describe("activity", () => {
  it("shows logged visits", async () => {
    mockFetch(() => json([{ client_id: "c1", loan_id: "L-1", borrower_name: "Meena Devi", officer_name: "Rahul", result: "paid", occurred_at: "2026-11-07T05:00:00Z", note: null }]));
    renderApp("/manager/activity");
    expect(await screen.findByRole("cell", { name: "Paid" })).toBeInTheDocument();
  });
});

describe("loans and manual rank", () => {
  it("sets a rank through the API and reloads", async () => {
    const f = mockFetch((_url, init) => (init.method === "PUT" ? json({}) : json(LOANS)));
    const user = userEvent.setup();
    renderApp("/manager/loans");
    const box = await screen.findByLabelText("Manual rank Meena Devi");
    await user.type(box, "1");
    await user.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() => {
      const put = f.mock.calls.find(([, i]) => i.method === "PUT")!;
      expect(put[0]).toContain("/manager/loans/L-1/rank");
      expect(JSON.parse(String(put[1].body))).toEqual({ rank: 1 });
    });
  });

  it("rejects an invalid rank without calling the API", async () => {
    const f = mockFetch(() => json(LOANS));
    const user = userEvent.setup();
    renderApp("/manager/loans");
    await user.type(await screen.findByLabelText("Manual rank Meena Devi"), "0");
    await user.click(screen.getByRole("button", { name: "Set" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("whole number");
    expect(f.mock.calls.some(([, i]) => i.method === "PUT")).toBe(false);
  });
});

describe("role boundary", () => {
  it("keeps an officer out of the manager area", async () => {
    saveSession({ token: "tok", role: "officer", language: "en" });
    mockFetch(() => json([]));
    renderApp("/manager");
    expect(await screen.findByRole("heading", { name: "Your visits" })).toBeInTheDocument();
  });
});
