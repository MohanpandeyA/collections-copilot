import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useResource } from "../api/useResource";
import { EmptyState, ErrorState, SkeletonRows } from "../components/States";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { fetchPromises, sweepPromises } from "./api";
import { inr } from "../format";

const FILTERS: { value: string; label: StringKey }[] = [
  { value: "", label: "allStates" }, { value: "open", label: "stateOpen" },
  { value: "kept", label: "stateKept" }, { value: "broken", label: "stateBroken" },
];
const STATE_LABEL: Record<string, StringKey> = { open: "stateOpen", kept: "stateKept", broken: "stateBroken" };

export default function Promises() {
  const { session } = useAuth();
  const { t } = useT();
  const [filter, setFilter] = useState("");
  const { state, reload } = useResource((tok) => fetchPromises(tok, filter), [filter]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sweep() {
    if (!session) return;
    setBusy(true); setNote(null);
    try {
      const r = await sweepPromises(session.token);
      setNote(`${t("sweepDone")}: ${r.marked_broken}`);
      reload();
    } catch { setNote(t("loadError")); } finally { setBusy(false); }
  }

  return (
    <>
      <h1 className="heading-5">{t("navPromises")}</h1>
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.value} className="btn btn-quiet" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{t(f.label)}</button>
        ))}
        <button className="btn" onClick={sweep} disabled={busy}>{t("sweep")}</button>
      </div>
      {note && <p className="body-5" role="status" style={{ color: "var(--accent-text)" }}>{note}</p>}
      {state.status === "loading" && <SkeletonRows />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && state.data.length === 0 && <EmptyState title={t("noPromises")} body={t("noPromisesBody")} />}
      {state.status === "ready" && state.data.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t("borrower")}</th><th>{t("officer")}</th><th>{t("date")}</th><th>{t("amount")}</th><th>{t("status")}</th></tr></thead>
            <tbody>{state.data.map((p) => (
              <tr key={`${p.loan_id}-${p.promise_date}`}>
                <td>{p.borrower_name}</td><td>{p.officer_name}</td><td>{p.promise_date}</td><td>{inr(p.amount)}</td>
                <td><span className="pill caption-5">{t(STATE_LABEL[p.state])}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
