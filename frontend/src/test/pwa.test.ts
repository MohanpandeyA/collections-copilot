import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../../index.html?raw";
import manifestText from "../../public/manifest.webmanifest?raw";
import swSource from "../../public/sw.js?raw";
import { registerServiceWorker } from "../pwa";

const icons = Object.keys(import.meta.glob("../../public/*.png")).map((p) => p.split("/").pop());

describe("install files", () => {
  it("the manifest names the app, starts at /, and has 192, 512 and maskable icons that exist", () => {
    const m = JSON.parse(manifestText);
    expect(m).toMatchObject({ name: "Collections Copilot", start_url: "/", display: "standalone" });
    const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ":" + i.purpose : ""}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512", "512x512:maskable"]));
    for (const i of m.icons) expect(icons).toContain(i.src.slice(1));
  });

  it("index.html links the manifest and the iOS icon", () => {
    const html = indexHtml;
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
  });
});

describe("registerServiceWorker", () => {
  const register = vi.fn(() => Promise.resolve({}));
  beforeEach(() => {
    register.mockClear();
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
  });
  afterEach(() => { Reflect.deleteProperty(navigator, "serviceWorker"); });

  it("registers /sw.js in a production build", () => {
    registerServiceWorker(true);
    expect(register).toHaveBeenCalledWith(expect.stringMatching(/^\/sw\.js\?v=\w+$/));
  });

  it("does nothing in development, so old files are never served while coding", () => {
    registerServiceWorker(false);
    expect(register).not.toHaveBeenCalled();
  });

  it("ignores a browser that has no service workers, and a failed registration", async () => {
    Reflect.deleteProperty(navigator, "serviceWorker");
    expect(() => registerServiceWorker(true)).not.toThrow();
    Object.defineProperty(navigator, "serviceWorker", { value: { register: () => Promise.reject(new Error("no")) }, configurable: true });
    expect(() => registerServiceWorker(true)).not.toThrow();
    await Promise.resolve();
  });
});

/** Runs public/sw.js against a small fake of the worker scope, then fires events at it. */
function loadWorker() {
  const store = new Map<string, Response>();
  const listeners: Record<string, (e: unknown) => void> = {};
  const key = (r: Request | string) => new URL(typeof r === "string" ? r : r.url, "https://app.test").pathname;
  const caches = {
    open: async () => ({
      addAll: async (urls: string[]) => { for (const u of urls) store.set(key(u), new Response("shell:" + u)); },
      put: async (r: Request | string, res: Response) => { store.set(key(r), res); },
    }),
    match: async (r: Request | string) => store.get(key(r))?.clone(),
    keys: async () => ["cc-shell-b1", "cc-shell-b2"],
    delete: vi.fn(async () => true),
  };
  const self = { addEventListener: (n: string, f: (e: unknown) => void) => { listeners[n] = f; }, skipWaiting: vi.fn(), clients: { claim: vi.fn() }, location: { origin: "https://app.test", href: "https://app.test/sw.js?v=b2" } };
  const net = { online: true, fn: vi.fn() };
  const fetchFn = async (input: Request | string) => {
    if (input === "/asset-manifest.json") return Response.json(["/assets/index-a.js", "/assets/LoanDetail-b.js"]);
    const r = input as Request;
    net.fn(r.url);
    if (!net.online) throw new TypeError("offline");
    const res = new Response("net:" + new URL(r.url).pathname);
    Object.defineProperty(res, "type", { value: "basic" }); // what a same-origin fetch returns
    return res;
  };
  new Function("self", "caches", "fetch", swSource)(self, caches, fetchFn);

  async function fire(url: string, init: { method?: string; mode?: string } = {}) {
    const request = Object.assign(new Request(url, { method: init.method ?? "GET" }), init.mode ? {} : {});
    Object.defineProperty(request, "mode", { value: init.mode ?? "no-cors" });
    let answer: Promise<Response> | undefined;
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => { answer = p; } });
    return answer ? (await answer).text() : null;
  }
  return { listeners, store, caches, self, net, fire };
}

describe("service worker", () => {
  it("install saves the shell and activates at once", async () => {
    const w = loadWorker();
    let done: Promise<unknown> | undefined;
    w.listeners.install({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(w.store.has("/")).toBe(true);
    expect(w.self.skipWaiting).toHaveBeenCalled();
  });

  it("install also saves every built screen, so an unopened loan page works offline", async () => {
    const w = loadWorker();
    let done: Promise<unknown> | undefined;
    w.listeners.install({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    w.net.online = false;
    expect(await w.fire("https://app.test/assets/LoanDetail-b.js")).toContain("/assets/LoanDetail-b.js");
    expect(w.net.fn).not.toHaveBeenCalled();
  });

  it("activate deletes the caches of older builds only", async () => {
    const w = loadWorker();
    let done: Promise<unknown> | undefined;
    w.listeners.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(w.caches.delete).toHaveBeenCalledTimes(1);
    expect(w.caches.delete).toHaveBeenCalledWith("cc-shell-b1");
  });

  it("a page opens from the network online and from the saved shell offline, even on a deep link", async () => {
    const w = loadWorker();
    expect(await w.fire("https://app.test/officer/loans/L-1", { mode: "navigate" })).toBe("net:/officer/loans/L-1");
    w.net.online = false;
    expect(await w.fire("https://app.test/officer/loans/L-1", { mode: "navigate" })).toBe("net:/officer/loans/L-1");
  });

  it("offline with nothing saved yet fails normally instead of inventing a page", async () => {
    const w = loadWorker();
    w.net.online = false;
    const res = await (async () => { try { return await w.fire("https://app.test/", { mode: "navigate" }); } catch { return "error"; } })();
    expect(res === "error" || res === "").toBe(true);
  });

  it("hashed assets are saved once and then never fetched again", async () => {
    const w = loadWorker();
    expect(await w.fire("https://app.test/assets/index-abc123.js")).toBe("net:/assets/index-abc123.js");
    w.net.fn.mockClear();
    w.net.online = false;
    expect(await w.fire("https://app.test/assets/index-abc123.js")).toBe("net:/assets/index-abc123.js");
    expect(w.net.fn).not.toHaveBeenCalled();
  });

  it("never touches API paths, other hosts, or anything that is not a GET", async () => {
    const w = loadWorker();
    for (const u of ["https://app.test/my/loans", "https://app.test/manager/dashboard", "https://app.test/outcomes/batch", "https://app.test/auth/login"])
      expect(await w.fire(u)).toBeNull();
    expect(await w.fire("https://api.test/my/loans")).toBeNull();
    expect(await w.fire("https://app.test/icon-192.png", { method: "POST" })).toBeNull();
    expect(w.store.size).toBe(0);
  });

  it("the app's own /manager page still opens offline even though /manager is also an API prefix", async () => {
    const w = loadWorker();
    await w.fire("https://app.test/", { mode: "navigate" });
    w.net.online = false;
    expect(await w.fire("https://app.test/manager", { mode: "navigate" })).toContain("net:/");
  });
});
