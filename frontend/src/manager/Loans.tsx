import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useResource } from "../api/useResource";
import { EmptyState, ErrorState, SkeletonRows } from "../components/States";
import { useT } from "../i18n/useT";
import { BAND_LABEL } from "../officer/LoanList";
import { fetchManagerLoans, setRank, type ManagerLoan } from "./api";

function RankCell({ loan, onSaved }: { loan: ManagerLoan; onSaved: () => void }) {
  const { session } = useAuth();
  const { t } = useT();
  const [value, setValue] = useState(loan.rank?.toString() ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(rank: number | null) {
    if (!session) return;
    setBusy(true); setErr(null);
    try { await setRank(session.token, loan.loan_id, rank); onSaved(); }
    catch { setErr(t("rankFailed")); } finally { setBusy(false); }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) { setErr(t("rankInvalid")); return; }
    void save(n);
  }
  return (
    <form className="rank-form" onSubmit={submit}>
      <input className="input" inputMode="numeric" aria-label={`${t("manualRank")} ${loan.borrower_name}`} placeholder={t("auto")}
        value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn btn-quiet" type="submit" disabled={busy}>{t("setRank")}</button>
      {loan.rank !== null && <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => { setValue(""); void save(null); }}>{t("clearRank")}</button>}
      {err && <span className="alert-error caption-5" role="alert">{err}</span>}
    </form>
  );
}

export default function Loans() {
  const { t } = useT();
  const { state, reload } = useResource(fetchManagerLoans);
  return (
    <>
      <h1 className="heading-5">{t("navLoans")}</h1>
      <p className="caption-5" style={{ maxWidth: 560 }}>{t("rankHelp")}</p>
      {state.status === "loading" && <SkeletonRows />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && state.data.length === 0 && <EmptyState title={t("noLoans")} body={t("noLoansBody")} />}
      {state.status === "ready" && state.data.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t("borrower")}</th><th>{t("officer")}</th><th>DPD</th><th>{t("priority")}</th><th>{t("manualRank")}</th></tr></thead>
            <tbody>{state.data.map((l) => (
              <tr key={l.loan_id}>
                <td>{l.borrower_name}</td><td>{l.officer_name}</td><td>{l.dpd}</td>
                <td><span className="pill caption-5"><span className={`dot dot-${l.band}`} aria-hidden="true" />{t(BAND_LABEL[l.band])}</span></td>
                <td><RankCell loan={l} onSaved={reload} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
