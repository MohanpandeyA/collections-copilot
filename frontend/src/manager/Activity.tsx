import { useResource } from "../api/useResource";
import { EmptyState, ErrorState, SkeletonRows } from "../components/States";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { inr } from "../format";
import { fetchActivity } from "./api";

const RESULT: Record<string, StringKey> = {
  paid: "outcomeLabelPaid", promise: "outcomeLabelPromise", unreachable: "outcomeLabelUnreachable", dispute: "outcomeLabelDispute",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default function Activity() {
  const { t } = useT();
  const { state, reload } = useResource(fetchActivity);
  return (
    <>
      <div className="page-head">
        <h1 className="heading-5">{t("navActivity")}</h1>
        <button className="btn btn-quiet" onClick={reload} disabled={state.status === "loading"}>{t("refresh")}</button>
      </div>
      {state.status === "loading" && <SkeletonRows />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && state.data.length === 0 && <EmptyState title={t("noActivity")} body={t("noActivityBody")} />}
      {state.status === "ready" && state.data.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t("when")}</th><th>{t("officer")}</th><th>{t("borrower")}</th><th>{t("result")}</th></tr></thead>
            <tbody>{state.data.map((a) => (
              <tr key={a.client_id}>
                <td>{when(a.occurred_at)}</td><td>{a.officer_name}</td><td>{a.borrower_name}</td>
                <td>{RESULT[a.result] ? t(RESULT[a.result]) : a.result}{a.amount_received && <span className="caption-5"> · {inr(a.amount_received)}</span>}{a.note && <span className="caption-5"> · {a.note}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
