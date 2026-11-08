import { useState } from "react";
import { useResource } from "../api/useResource";
import { EmptyState, ErrorState, SkeletonRows } from "../components/States";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { inr } from "../format";
import { fetchActivity } from "./api";

const PAGE = 25;
const RESULT: Record<string, StringKey> = {
  paid: "outcomeLabelPaid", promise: "outcomeLabelPromise", unreachable: "outcomeLabelUnreachable", dispute: "outcomeLabelDispute",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default function Activity() {
  const { t } = useT();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  // An end date before the start would be refused by the server; wait until the pair makes sense.
  const bad = !!from && !!to && from > to;
  const { state, reload } = useResource(
    (tok) => fetchActivity(tok, { limit: PAGE, offset, from: bad ? "" : from, to: bad ? "" : to }),
    [offset, from, to, bad],
  );
  const filtered = !!(from || to);
  const setDate = (set: (v: string) => void) => (v: string) => { set(v); setOffset(0); };
  const clear = () => { setFrom(""); setTo(""); setOffset(0); };

  return (
    <>
      <div className="page-head">
        <h1 className="heading-5">{t("navActivity")}</h1>
        <button className="btn btn-quiet" onClick={reload} disabled={state.status === "loading"}>{t("refresh")}</button>
      </div>
      <div className="filters">
        <label className="body-5" htmlFor="a-from">{t("dateFrom")}</label>
        <input id="a-from" className="input" type="date" value={from} max={to || undefined} onChange={(e) => setDate(setFrom)(e.target.value)} />
        <label className="body-5" htmlFor="a-to">{t("dateTo")}</label>
        <input id="a-to" className="input" type="date" value={to} min={from || undefined} onChange={(e) => setDate(setTo)(e.target.value)} />
        {filtered && <button className="btn btn-quiet" onClick={clear}>{t("clearFilters")}</button>}
      </div>
      {state.status === "loading" && <SkeletonRows />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && state.data.total === 0 && (filtered
        ? <EmptyState title={t("noActivityInRange")} body={t("noActivityInRangeBody")} />
        : <EmptyState title={t("noActivity")} body={t("noActivityBody")} />)}
      {state.status === "ready" && state.data.total > 0 && (() => {
        const { items, total } = state.data;
        const first = offset + 1, last = offset + items.length;
        return (
          <>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>{t("when")}</th><th>{t("officer")}</th><th>{t("borrower")}</th><th>{t("result")}</th></tr></thead>
                <tbody>{items.map((a) => (
                  <tr key={a.client_id}>
                    <td>{when(a.occurred_at)}</td><td>{a.officer_name}</td><td>{a.borrower_name}</td>
                    <td>{RESULT[a.result] ? t(RESULT[a.result]) : a.result}{a.amount_received && <span className="caption-5"> · {inr(a.amount_received)}</span>}{a.note && <span className="caption-5"> · {a.note}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <nav className="pager" aria-label={t("navActivity")}>
              <button className="btn btn-quiet" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t("newer")}</button>
              <span className="body-5" role="status">{t("pageRange").replace("{a}", String(first)).replace("{b}", String(last)).replace("{n}", String(total))}</span>
              <button className="btn btn-quiet" disabled={last >= total} onClick={() => setOffset(offset + PAGE)}>{t("older")}</button>
            </nav>
          </>
        );
      })()}
    </>
  );
}
