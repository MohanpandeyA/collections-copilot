import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSession } from "../auth/session";
import { json, mockFetch, renderApp } from "./render";

const DETAIL = {
  loan_id: "L-1", borrower_name: "Meena Devi", phone: "9876500001", pincode: "110001",
  outstanding: "45000.00", dpd: 62, last_payment_date: null, score: 81, band: "high", reasons: [], promise: null,
};
const DRAFT = { id: 7, loan_id: "L-1", language: "en", text: "Dear Meena Devi, your payment of Rs 45000 is due.", source: "template", state: "draft", note: null };

beforeEach(() => saveSession({ token: "tok", role: "officer", language: "en" }));
afterEach(() => vi.unstubAllGlobals());

function server(over: (url: string, init: RequestInit) => Response | undefined = () => undefined) {
  return mockFetch((url, init) => over(url, init)
    ?? (url.endsWith("/reminders/draft") ? json(DRAFT) : url.includes("/send") ? json({ id: 7, state: "sent", message_id: "m1" }) : json(DETAIL)));
}

describe("reminder panel", () => {
  it("shows the draft text, its source, and requires a tap to send", async () => {
    const f = server();
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Draft from template" }));
    expect(await screen.findByText(/Dear Meena Devi/)).toBeInTheDocument();
    expect(screen.getByText("Approved template")).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => String(u).includes("/send"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Send by SMS" }));
    expect(await screen.findByRole("status")).toHaveTextContent("demo gateway");
  });

  it("asks for an AI draft and shows the fallback note when AI was not used", async () => {
    const f = server((url) => url.endsWith("/reminders/draft") ? json({ ...DRAFT, note: "AI draft failed the safety check; using the approved template." }) : undefined);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Draft with AI" }));
    expect(await screen.findByText(/safety check/)).toBeInTheDocument();
    const call = f.mock.calls.find(([u]) => String(u).endsWith("/reminders/draft"))!;
    expect(JSON.parse(String(call[1].body))).toMatchObject({ use_ai: true, language: "en" });
  });

  it("labels AI-written text so the officer knows to read it", async () => {
    server((url) => url.endsWith("/reminders/draft") ? json({ ...DRAFT, source: "llm" }) : undefined);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Draft with AI" }));
    expect(await screen.findByText("Written by AI. Read it before sending.")).toBeInTheDocument();
  });

  it("explains a blocked send (409) and keeps the draft", async () => {
    server((url) => url.includes("/send") ? json({ detail: "blocked" }, 409) : undefined);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Draft from template" }));
    await user.click(await screen.findByRole("button", { name: "Send by WhatsApp" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("8 am and 7 pm");
    expect(screen.getByText(/Dear Meena Devi/)).toBeInTheDocument();
  });

  it("shows an error when drafting fails", async () => {
    server((url) => url.endsWith("/reminders/draft") ? json({ detail: "x" }, 500) : undefined);
    const user = userEvent.setup();
    renderApp("/officer/loans/L-1");
    await user.click(await screen.findByRole("button", { name: "Draft from template" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not draft");
  });
});
