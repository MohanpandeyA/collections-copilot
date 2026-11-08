import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { AuthProvider } from "../auth/AuthContext";
import { I18nProvider } from "../i18n/useT";

export function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

export function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal("fetch", fn);
  return fn;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** An insights payload for a branch with nothing in it yet. */
export const EMPTY_INSIGHTS = {
  bands: { high: 0, medium: 0, low: 0 },
  overdue_by_age: ["b1", "b2", "b3", "b4"].map((key) => ({ key, amount: "0.00" })),
  promises: { open: 0, kept: 0, broken: 0 },
  visits_by_day: Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-0${i + 1}`, count: 0 })),
  result_mix: { paid: 0, promise: 0, unreachable: 0, dispute: 0 },
  next_promises: [],
};

export const activityPage = (items: unknown[], total = items.length, offset = 0, limit = 25) => ({ items, total, limit, offset });

/** Answers each manager endpoint with its own payload, so a page that makes several calls gets the right one. */
export function managerRoutes(dash: unknown, extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    "/manager/dashboard": dash, "/manager/insights": EMPTY_INSIGHTS, "/manager/loans": [], "/manager/promises": [],
    "/manager/activity": activityPage([]), ...extra,
  };
  return (url: string) => {
    const path = new URL(url, "http://x").pathname;
    return json(path in table ? table[path] : []);
  };
}
