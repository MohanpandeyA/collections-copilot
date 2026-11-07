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

/** Answers each manager endpoint with its own payload, so a page that makes several calls gets the right one. */
export function managerRoutes(dash: unknown, extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = { "/manager/dashboard": dash, "/manager/loans": [], "/manager/promises": [], "/manager/activity": [], ...extra };
  return (url: string) => {
    const path = new URL(url, "http://x").pathname;
    return json(path in table ? table[path] : []);
  };
}
