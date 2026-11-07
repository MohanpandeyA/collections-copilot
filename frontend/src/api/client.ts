const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { token?: string | null; body?: unknown; form?: Record<string, string> };

/** One place that talks to the backend: adds the token, turns failures into ApiError. */
export async function api<T>(path: string, method: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = new URLSearchParams(opts.form);
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body });
  } catch {
    // fetch only throws when there is no connection or the server is unreachable
    throw new ApiError(0, "network");
  }
  if (!res.ok) {
    let detail = "Something went wrong";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch { /* body was not JSON */ }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}
