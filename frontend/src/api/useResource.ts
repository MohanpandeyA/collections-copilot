import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "./client";

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "ready"; data: T };

/** Loads data with the signed-in token. An expired token (401) signs the user out. */
export function useResource<T>(load: (token: string) => Promise<T>, deps: unknown[] = []) {
  const { session, signOut } = useAuth();
  const [state, setState] = useState<Resource<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setState({ status: "loading" });
    run(session.token).then(
      (data) => { if (!cancelled) setState({ status: "ready", data }); },
      (err) => {
        if (cancelled) return;
        const error = err instanceof ApiError ? err : new ApiError(0, "network");
        if (error.status === 401) signOut();
        else setState({ status: "error", error });
      },
    );
    return () => { cancelled = true; };
  }, [session, run, tick, signOut]);

  return { state, reload: () => setTick((n) => n + 1) };
}
