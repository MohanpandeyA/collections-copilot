import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, managerRoutes, mockFetch, renderApp } from "./render";

afterEach(() => vi.unstubAllGlobals());

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, name = "rahul", pw = "demo123") {
  await user.type(screen.getByLabelText("Username"), name);
  await user.type(screen.getByLabelText("Password"), pw);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("login", () => {
  it("sends signed-out visitors to the login page", async () => {
    renderApp("/officer");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("keeps the button disabled until both fields are filled", async () => {
    renderApp("/login");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("signs an officer in and lands on the officer home", async () => {
    const fetchMock = mockFetch((u) => u.endsWith("/auth/login") ? json({ access_token: "tok", token_type: "bearer", role: "officer", language: "en" }) : json([]));
    const user = userEvent.setup();
    renderApp("/login");
    await fillAndSubmit(user);
    expect(await screen.findByRole("heading", { name: "Your visits" })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/auth\/login$/);
    expect(String(init.body)).toBe("username=rahul&password=demo123");
  });

  it("sends a manager to the manager dashboard", async () => {
    const DASH = {
      open_loans: 1, overdue_amount: "1000.00", broken_promises: 0, open_promises: 0, snapshot_date: null,
      roll_rate: { cohort: 0, rolled: 0, rate: null }, by_officer: [],
    };
    const routes = managerRoutes(DASH);
    mockFetch((u) => u.endsWith("/auth/login")
      ? json({ access_token: "tok", token_type: "bearer", role: "manager", language: "en" })
      : routes(u));
    const user = userEvent.setup();
    renderApp("/login");
    await fillAndSubmit(user, "manager_central");
    expect(await screen.findByRole("heading", { name: "Branch overview" })).toBeInTheDocument();
  });

  it("shows a clear message for a wrong password and stays on the page", async () => {
    mockFetch(() => json({ detail: "Incorrect username or password" }, 401));
    const user = userEvent.setup();
    renderApp("/login");
    await fillAndSubmit(user, "rahul", "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Username or password is wrong");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("tells the user to wait when the server has locked the login", async () => {
    mockFetch(() => json({ detail: "Too many failed attempts. Try again later." }, 429));
    const user = userEvent.setup();
    renderApp("/login");
    await fillAndSubmit(user, "rahul", "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong attempts");
  });

  it("shows an offline message when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const user = userEvent.setup();
    renderApp("/login");
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection");
  });

  it("shows a server error message for a 500", async () => {
    mockFetch(() => json({ detail: "boom" }, 500));
    const user = userEvent.setup();
    renderApp("/login");
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("The server had a problem");
  });

  it("switches the whole screen to Hindi", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    await user.click(screen.getByRole("button", { name: "हिन्दी" }));
    expect(screen.getByRole("heading", { name: "साइन इन करें" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("hi");
  });
});

describe("role guard", () => {
  it("sends an officer away from the manager page", async () => {
    localStorage.setItem("cc.session", JSON.stringify({ token: "t", role: "officer", language: "en" }));
    renderApp("/manager");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your visits" })).toBeInTheDocument());
  });

  it("signs out and returns to login", async () => {
    localStorage.setItem("cc.session", JSON.stringify({ token: "t", role: "officer", language: "en" }));
    const user = userEvent.setup();
    renderApp("/officer");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("cc.session")).toBeNull();
  });

  it("shows the 404 page for unknown routes", async () => {
    renderApp("/nowhere");
    expect(await screen.findByRole("heading", { name: "This page does not exist" })).toBeInTheDocument();
  });
});
