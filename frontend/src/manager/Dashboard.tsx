import { useResource } from "../api/useResource";
import { ErrorState, SkeletonRows } from "../components/States";
import { useT } from "../i18n/useT";
import { fetchDashboard } from "./api";

export const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN")}`;
const pct = (r: number | null) => (r === null ? "–" : `${r}%`);

export default function Dashboard() {
  const { t } = useT();
  const { state, reload } = useResource(fetchDashboard);
  return (
    <>
      <h1 className="t-title">{t("navDashboard")}</h1>
      {state.status === "loading" && <SkeletonRows count={3} />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && (() => {
        const d = state.data;
        return (
          <>
            <div className="stats">
              <div className="card stat"><span className="t-caption">{t("mOpenLoans")}</span><span className="stat-big">{d.open_loans}</span></div>
              <div className="card stat"><span className="t-caption">{t("mOverdue")}</span><span className="stat-big">{inr(d.overdue_amount)}</span></div>
              <div className="card stat"><span className="t-caption">{t("mOpenPromises")}</span><span className="stat-big">{d.open_promises}</span></div>
              <div className="card stat"><span className="t-caption">{t("mBroken")}</span><span className="stat-big">{d.broken_promises}</span></div>
            </div>
            <section className="card stat" aria-labelledby="roll-h">
              <h2 id="roll-h" className="t-heading">{t("rollRate")}</h2>
              <span className="stat-big">{pct(d.roll_rate.rate)}</span>
              <p className="t-caption">
                {d.roll_rate.cohort === 0 ? t("rollNone") : `${d.roll_rate.rolled} ${t("rollOf")} ${d.roll_rate.cohort}`}
                {d.snapshot_date && ` · ${d.snapshot_date}`}
              </p>
              <p className="t-caption">{t("rollExplain")}</p>
            </section>
            <section className="card" aria-labelledby="off-h">
              <h2 id="off-h" className="t-heading" style={{ padding: "var(--s-16) var(--s-16) 0" }}>{t("byOfficer")}</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t("officer")}</th><th>{t("mOpenLoans")}</th><th>{t("rollRate")}</th></tr></thead>
                  <tbody>
                    {d.by_officer.map((o) => (
                      <tr key={o.officer_id}>
                        <td>{o.officer_name}</td><td>{o.open_loans}</td>
                        <td>{pct(o.rate)}{o.cohort > 0 && <span className="t-caption"> ({o.rolled}/{o.cohort})</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        );
      })()}
    </>
  );
}
