import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSession } from "../auth/session";
import { json, mockFetch, renderApp } from "./render";

const DETAIL = {
  loan_id: "L-1", borrower_name: "Meena Devi", phone: "9876500001", pincode: "110001",
  outstanding: "45000.00", dpd: 62, last_payment_date: null, score: 81, band: "high",
  reasons: [{ code: "dpd", text: "62 days overdue", contribution: 20 }], promise: null,
};

beforeEach(() => saveSession({ token: "tok", role: "officer", language: "en" }));
afterEach(() => vi.unstubAllGlobals());

type Call = [string, RequestInit];
const batchBodies = (f: ReturnType<typeof mockFetch>) =>
  (f.mock.calls as unknown as Call[]).filter(([u]) => u.endsWith("/outcomes/batch")).map(([, i]) => JSON.parse(String(i.body)));

function server(online: () => boolean) {
  return mockFetch((url, init) => {
    if (url.endsWith("/outcomes/batch")) {
      if (!online()) throw new TypeError("offline");
      const items = JSON.parse(String(init.body)).items as { client_id: string }[];
      return json({ results: items.map((i) => ({ client_id: i.client_id, status: "created" })) });
    }
    return json(DETAIL);
  });
}

describe("outcome logging", () => {
  it("one tap saves a Paid outcome and syncs it", async () => {
    const f = server(() => true);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Paid" }));
    await waitFor(() => expect(batchBodies(f)).toHaveLength(1));
    const item = batchBodies(f)[0].items[0];
    expect(item).toMatchObject({ loan_id: "L-1", result: "paid" });
    expect(item.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument();
  });

  it("offline: shows pending, then syncs when back online and clears the badge", async () => {
    let online = false;
    const f = server(() => online);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Not reachable" }));
    expect(await screen.findByText("1 waiting to sync")).toBeInTheDocument();
    online = true;
    await user.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument());
    expect(batchBodies(f).length).toBeGreaterThanOrEqual(2);
    // the same client_id was sent both times, so the server can de-duplicate
    const ids = batchBodies(f).map((b) => b.items[0].client_id);
    expect(new Set(ids).size).toBe(1);
  });

  it("a promise asks for date and amount and rejects a past date", async () => {
    const f = server(() => true);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Promised to pay" }));
    await user.type(screen.getByLabelText("Promise date"), "2020-01-01");
    await user.type(screen.getByLabelText("Promise amount (₹)"), "5000");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a date");
    expect(batchBodies(f)).toHaveLength(0);
  });

  it("a valid promise is queued with date and amount", async () => {
    const f = server(() => true);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Promised to pay" }));
    await user.type(screen.getByLabelText("Promise date"), "2099-01-01");
    await user.type(screen.getByLabelText("Promise amount (₹)"), "5000");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    await waitFor(() => expect(batchBodies(f)).toHaveLength(1));
    expect(batchBodies(f)[0].items[0]).toMatchObject({ result: "promise", promise_date: "2099-01-01", promise_amount: "5000.00" });
  });

  it("shows a rejected item with its reason and lets the officer dismiss it", async () => {
    mockFetch((url, init) => url.endsWith("/outcomes/batch")
      ? json({ results: (JSON.parse(String(init.body)).items as { client_id: string }[]).map((i) => ({ client_id: i.client_id, status: "rejected", reason: "loan not assigned to you" })) })
      : json(DETAIL));
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Dispute" }));
    expect(await screen.findByText(/loan not assigned to you/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText(/loan not assigned to you/)).not.toBeInTheDocument());
  });
});
