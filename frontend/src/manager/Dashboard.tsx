import { useNavigate } from "react-router-dom";
import { useResource } from "../api/useResource";
import { Bars, Donut, Ring, StackBar } from "../charts/Charts";
import { Icon, type IconName } from "../components/Icon";
import { ErrorState, SkeletonRows } from "../components/States";
import { inr, lakh } from "../format";
import { useT } from "../i18n/useT";
import { fetchActivity, fetchDashboard, fetchManagerLoans, fetchPromises } from "./api";
import { bandCounts, overdueByAge, promiseCounts, resultMix, visitsByDay } from "./insights";
import "../charts/Charts.css";

const pct = (r: number | null) => (r === null ? "–" : `${r}%`);

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string | number }) {
  return (
    <div className="card panel">
      <div className="stat-row"><span className="caption-5">{label}</span><span className="stat-icon"><Icon name={icon} /></span></div>
      <span className="stat-big">{value}</span>
    </div>
  );
}

function Panel({ icon, title, wide, children }: { icon: IconName; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`card panel${wide ? " panel-wide" : ""}`} aria-label={title}>
      <h2 className="title-2 panel-title"><Icon name={icon} size={20} />{title}</h2>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { t } = useT();
  const nav = useNavigate();
  const { state, reload } = useResource(async (tok) => {
    const [dash, loans, promises, activity] = await Promise.all([
      fetchDashboard(tok), fetchManagerLoans(tok), fetchPromises(tok, ""), fetchActivity(tok),
    ]);
    return { dash, loans, promises, activity };
  });

  return (
    <>
      <h1 className="heading-5">{t("dashGreeting")}</h1>
      {state.status === "loading" && <SkeletonRows count={4} />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && (() => {
        const { dash: d, loans, promises, activity } = state.data;
        const bands = bandCounts(loans);
        const prom = promiseCounts(promises);
        const mix = resultMix(activity);
        const days = visitsByDay(activity, new Date());
        const maxOpen = Math.max(...d.by_officer.map((o) => o.open_loans), 1);
        return (
          <>
            <div className="stats">
              <Stat icon="list-bullets" label={t("mOpenLoans")} value={d.open_loans} />
              <Stat icon="warning-circle" label={t("mOverdue")} value={lakh(Number(d.overdue_amount))} />
              <Stat icon="handshake" label={t("mOpenPromises")} value={d.open_promises} />
              <Stat icon="clock" label={t("mBroken")} value={d.broken_promises} />
            </div>

            <div className="dash-grid">
              <Panel icon="chart-pie-slice" title={t("chPriority")}>
                <Donut title={t("chPriority")} centre={{ big: String(loans.length), small: t("chPriorityCentre") }}
                  onSelect={(band) => nav(`/manager/loans?band=${band}`)}
                  slices={[
                    { key: "high", label: t("bandHigh"), value: bands.high, color: "var(--band-high)" },
                    { key: "medium", label: t("bandMedium"), value: bands.medium, color: "var(--band-medium)" },
                    { key: "low", label: t("bandLow"), value: bands.low, color: "var(--band-low)" },
                  ]} />
              </Panel>

              <Panel icon="chart-bar" title={t("chAge")}>
                {loans.length === 0 ? <p className="body-6">{t("chNoData")}</p> : (
                  <Bars title={t("chAge")} bars={overdueByAge(loans).map((b) => ({ ...b, label: b.label, display: lakh(b.value) }))} />
                )}
                <p className="caption-5">{t("chAgeDays")}</p>
              </Panel>

              <Panel icon="pulse" title={t("rollRate")}>
                <div className="stat-row">
                  <Ring percent={d.roll_rate.rate} label={pct(d.roll_rate.rate)} caption={t("rollRate")} />
                  <div>
                    <p className="body-5">{d.roll_rate.cohort === 0 ? t("rollNone") : `${d.roll_rate.rolled} ${t("rollOf")} ${d.roll_rate.cohort}`}</p>
                    {d.snapshot_date && <p className="caption-5">{d.snapshot_date}</p>}
                  </div>
                </div>
                <p className="caption-5">{t("rollExplain")}</p>
              </Panel>

              <Panel icon="handshake" title={t("chPromises")}>
                <StackBar title={t("chPromises")} parts={[
                  { key: "open", label: t("stateOpen"), value: prom.open, color: "var(--accent)" },
                  { key: "kept", label: t("stateKept"), value: prom.kept, color: "var(--band-low)" },
                  { key: "broken", label: t("stateBroken"), value: prom.broken, color: "var(--band-high)" },
                ]} />
                <ul className="next-list" aria-label={t("nextPromises")}>
                  {promises.filter((p) => p.state === "open").sort((a, b) => a.promise_date.localeCompare(b.promise_date)).slice(0, 4).map((p) => (
                    <li key={p.loan_id} className="next-row">
                      <span className="body-5">{p.borrower_name}</span>
                      <span className="caption-5">{p.promise_date}</span>
                      <span className="body-5 hbar-n">{inr(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel icon="check-circle" title={t("chVisits")}>
                <Bars title={t("chVisits")} bars={days.map((x) => ({ ...x, display: String(x.value) }))} color="var(--accent)" />
                <StackBar title={t("chVisitsMix")} parts={[
                  { key: "paid", label: t("outcomeLabelPaid"), value: mix.paid, color: "var(--band-low)" },
                  { key: "promise", label: t("outcomeLabelPromise"), value: mix.promise, color: "var(--accent)" },
                  { key: "unreachable", label: t("outcomeLabelUnreachable"), value: mix.unreachable, color: "var(--ink-soft)" },
                  { key: "dispute", label: t("outcomeLabelDispute"), value: mix.dispute, color: "var(--band-high)" },
                ]} />
              </Panel>

              <Panel icon="squares-four" title={t("chOfficers")} wide>
                <div className="hbar">
                  {d.by_officer.map((o) => (
                    <div className="hbar-row" key={o.officer_id}>
                      <span className="body-5">{o.officer_name}</span>
                      <div className="hbar-track" aria-hidden="true"><div className="hbar-fill" style={{ width: `${(o.open_loans / maxOpen) * 100}%` }} /></div>
                      <span className="body-5 hbar-n">{o.open_loans}</span>
                    </div>
                  ))}
                </div>
                <p className="caption-5">{t("rollRate")}: {d.by_officer.map((o) => `${o.officer_name.split(" ")[0]} ${pct(o.rate)}`).join(" · ")}</p>
              </Panel>
            </div>
          </>
        );
      })()}
    </>
  );
}
