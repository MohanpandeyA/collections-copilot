import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSession } from "../auth/session";
import * as officerApi from "../officer/api";
import { json, mockFetch, renderApp } from "./render";

const LIST_FIXTURE = [
  { loan_id: "L-1", borrower_name: "Meena Devi", outstanding: "45000.00", dpd: 62, band: "high", score: 81 },
  { loan_id: "L-2", borrower_name: "Ravi Kumar", outstanding: "12000.00", dpd: 18, band: "low", score: 22 },
];
const LOANS = [
  { loan_id: "L-1", borrower_name: "Meena Devi", outstanding: "45000.00", dpd: 62, band: "high", score: 81 },
  { loan_id: "L-2", borrower_name: "Ravi Kumar", outstanding: "12000.00", dpd: 18, band: "low", score: 22 },
];
const DETAIL = {
  loan_id: "L-1", borrower_name: "Meena Devi", phone: "9876500001", pincode: "110001",
  outstanding: "45000.00", dpd: 62, last_payment_date: null, score: 81, band: "high",
  reasons: [{ code: "dpd", text: "62 days overdue", contribution: 20 }],
  promise: { state: "broken", promise_date: "2026-11-01", amount: "5000.00" },
};

beforeEach(() => saveSession({ token: "tok", role: "officer", language: "en" }));
afterEach(() => vi.unstubAllGlobals());

describe("officer list", () => {
  it("shows a skeleton, then rows with name, DPD and a labelled colour dot", async () => {
    mockFetch(() => json(LOANS));
    renderApp("/officer");
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
    const row = (await screen.findByRole("link", { name: /Meena Devi/ }));
    expect(within(row).getByText("62 days overdue")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "High priority" })).toBeInTheDocument();
    expect(screen.getByText("2 loans to visit today")).toBeInTheDocument();
  });

  it("sends the bearer token", async () => {
    const f = mockFetch(() => json(LOANS));
    renderApp("/officer");
    await screen.findByText("Ravi Kumar");
    expect((f.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("shows an empty state", async () => {
    mockFetch(() => json([]));
    renderApp("/officer");
    expect(await screen.findByText("No overdue loans assigned")).toBeInTheDocument();
  });

  it("shows an error and the retry button actually reloads", async () => {
    let fail = true;
    mockFetch(() => (fail ? json({ detail: "x" }, 500) : json(LOANS)));
    const user = userEvent.setup();
    renderApp("/officer");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Meena Devi")).toBeInTheDocument();
  });

  it("signs out when the token has expired", async () => {
    mockFetch(() => json({ detail: "expired" }, 401));
    renderApp("/officer");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("switches to Hindi", async () => {
    mockFetch(() => json(LOANS));
    const user = userEvent.setup();
    renderApp("/officer");
    await screen.findByText("Meena Devi");
    await user.click(screen.getByRole("button", { name: "Language" }));
    expect(await screen.findByText("62 दिन बकाया")).toBeInTheDocument();
  });
});

describe("loan detail", () => {
  const route = (url: string) => (url.endsWith("/contact-attempts") ? json({ allowed: true, block_reason: null }) : json(DETAIL));

  it("opens from the list and shows facts, promise and reasons", async () => {
    mockFetch((url) => (url.includes("/my/loans/") ? json(DETAIL) : json(LOANS)));
    const user = userEvent.setup();
    renderApp("/officer");
    await user.click(await screen.findByRole("link", { name: /Meena Devi/ }));
    expect(await screen.findByRole("heading", { name: "Meena Devi" })).toBeInTheDocument();
    expect(screen.getByText("₹45,000")).toBeInTheDocument();
    expect(screen.getByText("No payment on record")).toBeInTheDocument();
    expect(screen.getByText("Broken promise")).toBeInTheDocument();
    expect(screen.getByText("62 days overdue", { selector: "li > span" })).toBeInTheDocument();
  });

  it("checks the server, then dials, when allowed", async () => {
    const dial = vi.spyOn(officerApi, "openDialer").mockImplementation(() => {});
    const f = mockFetch(route);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Call borrower" }));
    await waitFor(() => expect(dial).toHaveBeenCalledWith("9876500001"));
    expect(f.mock.calls.some(([u]) => String(u).endsWith("/contact-attempts"))).toBe(true);
  });

  it("does not dial outside the contact window", async () => {
    const dial = vi.spyOn(officerApi, "openDialer").mockImplementation(() => {});
    mockFetch((url) => (url.endsWith("/contact-attempts") ? json({ allowed: false, block_reason: "outside_window" }) : json(DETAIL)));
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Call borrower" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("8 am and 7 pm");
    expect(dial).not.toHaveBeenCalled();
  });

  it("does not dial when offline, because the server must check the hours", async () => {
    const dial = vi.spyOn(officerApi, "openDialer").mockImplementation(() => {});
    mockFetch((url) => { if (url.endsWith("/contact-attempts")) throw new TypeError("offline"); return json(DETAIL); });
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Call borrower" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Needs a connection");
    expect(dial).not.toHaveBeenCalled();
  });

  it("shows not-found for a loan that is not theirs", async () => {
    mockFetch(() => json({ detail: "Not found" }, 404));
    renderApp("/officer/loans/L-9");
    expect(await screen.findByText("This loan is not on your list")).toBeInTheDocument();
  });
});


describe("officer list filters", () => {
  const rows = () => mockFetch((u) => (u.includes("/my/loans") ? json(LIST_FIXTURE) : json([])));

  it("shows the total to recover and each row's amount", async () => {
    rows();
    renderApp("/officer");
    expect(await screen.findByRole("region", { name: "To recover" })).toHaveTextContent("₹57,000");
    const row = await screen.findByRole("link", { name: /Meena Devi/ });
    expect(within(row).getByText("₹45,000")).toBeInTheDocument();
  });

  it("filters by priority chip and clears again", async () => {
    rows();
    const user = userEvent.setup();
    renderApp("/officer");
    await screen.findByText("Ravi Kumar");
    await user.click(screen.getByRole("button", { name: /^High 1/ }));
    expect(screen.queryByText("Ravi Kumar")).not.toBeInTheDocument();
    expect(screen.getByText("Meena Devi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^All 2/ }));
    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
  });

  it("searches by name and offers a way out when nothing matches", async () => {
    rows();
    const user = userEvent.setup();
    renderApp("/officer");
    await screen.findByText("Ravi Kumar");
    await user.type(screen.getByRole("searchbox"), "ravi");
    expect(screen.queryByText("Meena Devi")).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(await screen.findByText("No loans match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
  });
});
