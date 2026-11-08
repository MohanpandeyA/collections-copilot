import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useResource } from "../api/useResource";
import { Ring } from "../charts/Charts";
import { Icon } from "../components/Icon";
import { ErrorState, Page, SkeletonRows } from "../components/States";
import { inr } from "../format";
import { useT } from "../i18n/useT";
import { checkCall, fetchLoan, openDialer } from "./api";
import { BAND_LABEL } from "./LoanList";
import OutcomePanel from "./OutcomePanel";
import ReminderPanel from "./ReminderPanel";

import { dpdFill } from "./list";
import "../charts/Charts.css";

export default function LoanDetail() {
  const { loanId = "" } = useParams();
  const { session } = useAuth();
  const { t } = useT();
  const { state, reload } = useResource((tok) => fetchLoan(tok, loanId), [loanId]);
  const [calling, setCalling] = useState(false);
  const [callMsg, setCallMsg] = useState<string | null>(null);

  async function onCall(phone: string) {
    if (!session) return;
    setCalling(true);
    setCallMsg(null);
    try {
      const res = await checkCall(session.token, loanId); // server clock decides, and audits the attempt
      if (res.allowed) openDialer(phone);
      else setCallMsg(t("callBlocked"));
    } catch (err) {
      setCallMsg(err instanceof ApiError && err.status === 0 ? t("callNeedsNetwork") : t("loadError"));
    } finally {
      setCalling(false);
    }
  }

  return (
    <Page>
      <Link className="btn btn-quiet back" to="/officer"><Icon name="arrow-left" size={18} />{t("back")}</Link>
      {state.status === "loading" && <SkeletonRows count={3} />}
      {state.status === "error" && (state.error.status === 404
        ? <div className="state" role="alert"><p className="body-3">{t("loanNotFound")}</p></div>
        : <ErrorState onRetry={reload} />)}
      {state.status === "ready" && (() => {
        const d = state.data;
        return (
          <article className="card detail-card" aria-labelledby="loan-name">
            <header className="detail-head">
              <div>
                <h1 id="loan-name" className="heading-5">{d.borrower_name}</h1>
                <p className="caption-5">{d.loan_id}</p>
                <p className={`pill-band pill-${d.band} body-5`}>
                  <span className={`dot dot-${d.band}`} aria-hidden="true" />{t(BAND_LABEL[d.band])}
                </p>
              </div>
              <Ring small percent={Math.round(d.score)} label={String(Math.round(d.score))} caption={t("scoreLabel")} color={`var(--band-${d.band})`} />
            </header>

            <dl className="tiles">
              <div className="tile">
                <dt className="caption-5">{t("outstanding")}</dt>
                <dd className="heading-6">{inr(d.outstanding)}</dd>
              </div>
              <div className="tile">
                <dt className="caption-5">DPD</dt>
                <dd className="heading-6">{d.dpd} <span className="caption-5">{t("dpdDays")}</span></dd>
                <span className="meter" aria-hidden="true"><span className={`meter-fill dot-${d.band}`} style={{ width: `${dpdFill(d.dpd)}%` }} /></span>
              </div>
              <div className="tile">
                <dt className="caption-5">{t("lastPayment")}</dt>
                <dd className="body-3">{d.last_payment_date ?? t("noPayment")}</dd>
              </div>
              {d.promise && (
                <div className="tile tile-promise">
                  <dt className="caption-5">{t(d.promise.state === "open" ? "promiseOpen" : d.promise.state === "broken" ? "promiseBroken" : "promiseKept")}</dt>
                  <dd className="body-3">{inr(d.promise.amount)} · {d.promise.promise_date}</dd>
                </div>
              )}
            </dl>

            <section>
              <h2 className="body-5" style={{ marginBottom: "var(--s-8)" }}>{t("whyRank")}</h2>
              <ol className="reasons body-3">
                {d.reasons.map((r) => (
                  <li key={r.code}>
                    <span>{r.text}</span>
                    <span className="meter" aria-hidden="true"><span className="meter-fill meter-soft" style={{ width: `${(r.contribution / Math.max(...d.reasons.map((x) => x.contribution), 1)) * 100}%` }} /></span>
                  </li>
                ))}
              </ol>
            </section>

            <OutcomePanel loanId={d.loan_id} outstanding={d.outstanding} />
            <ReminderPanel loanId={d.loan_id} />
            <div className="actions">
              <button className="btn" onClick={() => onCall(d.phone)} disabled={calling}>
                <Icon name="phone" />{calling ? t("calling") : t("call")}
              </button>
              <a className="btn btn-quiet" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.pincode} India`)}`}>
                <Icon name="map-pin" />{t("map")}
              </a>
              {callMsg && <p className="alert-error body-5" role="alert">{callMsg}</p>}
            </div>
          </article>
        );
      })()}
    </Page>
  );
}
