import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Page, SkeletonRows } from "../components/States";
import { useResource } from "../api/useResource";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { fetchLoans, type Band } from "./api";

export const BAND_LABEL: Record<Band, StringKey> = { high: "bandHigh", medium: "bandMedium", low: "bandLow" };

export default function LoanList() {
  const { t } = useT();
  const { state, reload } = useResource(fetchLoans);

  return (
    <Page>
      <div>
        <h1 className="t-title">{t("officerHome")}</h1>
        {state.status === "ready" && state.data.length > 0 && (
          <p className="t-caption">{state.data.length} {t("visitsCount")}</p>
        )}
      </div>
      {state.status === "loading" && <SkeletonRows />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && state.data.length === 0 && (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      )}
      {state.status === "ready" && state.data.length > 0 && (
        <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {state.data.map((l) => (
            <li key={l.loan_id}>
              <Link className="card row" to={`/officer/loans/${encodeURIComponent(l.loan_id)}`}>
                <span className={`dot dot-${l.band}`} role="img" aria-label={t(BAND_LABEL[l.band])} />
                <span className="row-main">
                  <span className="t-body row-name" style={{ display: "block", fontWeight: 500 }}>{l.borrower_name}</span>
                  <span className="t-caption">{l.dpd} {t("dpdDays")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
