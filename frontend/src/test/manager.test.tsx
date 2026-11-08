import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSession } from "../auth/session";
import { activityPage, EMPTY_INSIGHTS, json, managerRoutes, mockFetch, renderApp } from "./render";

const DASH = {
  open_loans: 12, overdue_amount: "250000.00", broken_promises: 2, open_promises: 3, snapshot_date: "2026-11-01",
  roll_rate: { cohort: 8, rolled: 2, rate: 25.0 },
  by_officer: [{ officer_id: 1, officer_name: "Rahul", open_loans: 6, cohort: 4, rolled: 1, rate: 25.0 }],
};
const LOANS = [{ loan_id: "L-1", borrower_name: "Meena Devi", officer_name: "Rahul", dpd: 62, outstanding: "50000.00", score: 81, band: "high", rank: null }];

beforeEach(() => saveSession({ token: "tok", role: "manager", language: "en" }));
afterEach(() => vi.unstubAllGlobals());

describe("manager dashboard", () => {
  it("shows the headline numbers and roll rate with its working", async () => {
    mockFetch(managerRoutes(DASH));
    renderApp("/manager");
    expect(await screen.findByText("₹2.5 L")).toBeInTheDocument();
    const roll = screen.getByRole("region", { name: "Roll rate" });
    expect(within(roll).getByText("25%")).toBeInTheDocument();
    expect(within(roll).getByText(/2 of 8/)).toBeInTheDocument();
    expect(screen.getAllByText("Rahul").length).toBeGreaterThan(0);
  });

  it("says so when the month start group is empty instead of showing 0%", async () => {
    mockFetch(managerRoutes({ ...DASH, roll_rate: { cohort: 0, rolled: 0, rate: null }, snapshot_date: null }));
    renderApp("/manager");
    expect(await screen.findByText("No loans in the month start group yet")).toBeInTheDocument();
  });

  it("shows an error with a working retry", async () => {
    let fail = true;
    const ok = managerRoutes(DASH);
    mockFetch((u) => (fail ? json({ detail: "x" }, 500) : ok(u)));
    const user = userEvent.setup();
    renderApp("/manager");
    const retry = await screen.findByRole("button", { name: "Try again" });
    fail = false;
    await user.click(retry);
    expect(await screen.findByText("₹2.5 L")).toBeInTheDocument();
  });

  it("navigates between sections", async () => {
    mockFetch(managerRoutes(DASH));
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

  it("closing missing loans is off by default and sent only when ticked, and the closed count is shown", async () => {
    const f = mockFetch(() => json({ batch_id: 1, loaded: 5, assigned: 5, fallback_count: 0, rejected_count: 0, rejected: [], closed: 3 }));
    const user = userEvent.setup();
    renderApp("/manager/import");
    const box = await screen.findByRole("checkbox", { name: /Close loans that are not in this file/ });
    expect(box).not.toBeChecked();
    await user.upload(screen.getByLabelText("Choose CSV file"), file());
    await user.click(screen.getByRole("button", { name: "Upload and assign" }));
    await screen.findByText("Import finished");
    expect(String(f.mock.calls[0][0])).not.toContain("close_missing");
    expect(screen.getByText(/Closed: 3/)).toBeInTheDocument();

    await user.click(box);
    await user.upload(screen.getByLabelText("Choose CSV file"), file());
    await user.click(screen.getByRole("button", { name: "Upload and assign" }));
    await waitFor(() => expect(f.mock.calls).toHaveLength(2));
    expect(String(f.mock.calls[1][0])).toContain("/manager/imports?close_missing=true");
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
  const row = (id: string, who: string, extra: object = {}) =>
    ({ client_id: id, loan_id: "L-1", borrower_name: who, officer_name: "Rahul", result: "paid", occurred_at: "2026-11-07T05:00:00Z", note: null, ...extra });

  it("shows logged visits", async () => {
    mockFetch(() => json(activityPage([row("c1", "Meena Devi")])));
    renderApp("/manager/activity");
    expect(await screen.findByRole("cell", { name: "Paid" })).toBeInTheDocument();
  });

  it("shows the amount received next to a payment", async () => {
    mockFetch(() => json(activityPage([row("c1", "Meena Devi", { amount_received: "1500.00" })])));
    renderApp("/manager/activity");
    expect(await screen.findByText(/₹1,500/)).toBeInTheDocument();
  });

  it("Refresh fetches the feed again and shows rows logged since", async () => {
    let calls = 0;
    mockFetch(() => json(activityPage(++calls === 1 ? [row("c1", "Meena Devi")] : [row("c1", "Meena Devi"), row("c2", "Ravi Kumar")])));
    const user = userEvent.setup();
    renderApp("/manager/activity");
    await screen.findByText("Meena Devi");
    expect(screen.queryByText("Ravi Kumar")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("pages with Newer and Older, asks the server for each page, and shows where you are", async () => {
    const f = mockFetch((url) => {
      const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
      return json(activityPage([row(`c${offset}`, offset === 0 ? "First Page" : "Second Page")], 30, offset));
    });
    const user = userEvent.setup();
    renderApp("/manager/activity");
    expect(await screen.findByText("First Page")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 to 1 of 30");
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("Second Page")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("26 to 26 of 30");
    expect(f.mock.calls.some(([u]) => String(u).includes("limit=25") && String(u).includes("offset=25"))).toBe(true);
    await user.click(screen.getByRole("button", { name: "Newer" }));
    expect(await screen.findByText("First Page")).toBeInTheDocument();
  });

  it("Older is disabled on the last page", async () => {
    mockFetch(() => json(activityPage([row("c1", "Meena Devi")], 1)));
    renderApp("/manager/activity");
    await screen.findByText("Meena Devi");
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
  });

  it("the date filter goes to the server and clears", async () => {
    const f = mockFetch(() => json(activityPage([row("c1", "Meena Devi")])));
    const user = userEvent.setup();
    renderApp("/manager/activity");
    await screen.findByText("Meena Devi");
    await user.type(screen.getByLabelText("From"), "2026-11-01");
    await user.type(screen.getByLabelText("To"), "2026-11-05");
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes("date_from=2026-11-01") && String(u).includes("date_to=2026-11-05"))).toBe(true));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(String(f.mock.calls[f.mock.calls.length - 1][0])).not.toContain("date_from"));
  });

  it("says so when the chosen dates have no visits, and when the end is before the start it does not call the server with that pair", async () => {
    const f = mockFetch((url) => json(activityPage(url.includes("date_from") ? [] : [row("c1", "Meena Devi")])));
    const user = userEvent.setup();
    renderApp("/manager/activity");
    await screen.findByText("Meena Devi");
    await user.type(screen.getByLabelText("From"), "2026-11-01");
    expect(await screen.findByText("No visits in these dates")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("To"), "2026-11-03");
    await user.type(screen.getByLabelText("From"), "2026-11-09");
    expect(f.mock.calls.every(([u]) => !(String(u).includes("date_from=2026-11-09") && String(u).includes("date_to=2026-11-03")))).toBe(true);
  });
});

describe("dashboard insights from the server", () => {
  it("draws the charts from the server counts, not from a loan list", async () => {
    const insights = {
      ...EMPTY_INSIGHTS,
      bands: { high: 3, medium: 2, low: 1 },
      promises: { open: 4, kept: 5, broken: 6 },
      result_mix: { paid: 7, promise: 1, unreachable: 2, dispute: 0 },
      next_promises: [{ loan_id: "L-9", borrower_name: "Kavita Rao", officer_name: "Rahul", promise_date: "2026-11-12", amount: "3000.00", state: "open" }],
    };
    const f = mockFetch(managerRoutes(DASH, { "/manager/insights": insights }));
    renderApp("/manager");
    expect(await screen.findByText("Kavita Rao")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Priority|priority/ })).toBeInTheDocument();
    const urls = f.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.endsWith("/manager/insights"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/manager/loans") || u.includes("/manager/activity"))).toBe(false);
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

describe("loans filters", () => {
  const MANY = [
    { ...LOANS[0] },
    { loan_id: "L-2", borrower_name: "Asha Rani", officer_name: "Priya", dpd: 5, outstanding: "2000.00", score: 20, band: "low", rank: null },
  ];

  it("filters by band chip and by search, and offers a way out when nothing matches", async () => {
    mockFetch(() => json(MANY));
    const user = userEvent.setup();
    renderApp("/manager/loans");
    expect(await screen.findByText("Asha Rani")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "High priority" }));
    expect(screen.queryByText("Asha Rani")).not.toBeInTheDocument();
    expect(screen.getByText("Meena Devi")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(await screen.findByText("No loans match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Asha Rani")).toBeInTheDocument();
  });

  it("opens already filtered when arriving from the donut", async () => {
    mockFetch(() => json(MANY));
    renderApp("/manager/loans?band=low");
    expect(await screen.findByText("Asha Rani")).toBeInTheDocument();
    expect(screen.queryByText("Meena Devi")).not.toBeInTheDocument();
  });
});
