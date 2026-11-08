import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Page, SkeletonRows } from "../components/States";
import { Icon } from "../components/Icon";
import { useResource } from "../api/useResource";
import { inr, lakh } from "../format";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { StackBar } from "../charts/Charts";
import { fetchLoans, type Band, type LoanRow } from "./api";
import { bandTotals, dpdFill, filterVisits, splitVisited, totalOutstanding } from "./list";
import "../charts/Charts.css";

export const BAND_LABEL: Record<Band, StringKey> = { high: "bandHigh", medium: "bandMedium", low: "bandLow" };
const BAND_SHORT: Record<Band, StringKey> = { high: "bandShortHigh", medium: "bandShortMedium", low: "bandShortLow" };
const BANDS: Band[] = ["high", "medium", "low"];

export default function LoanList() {
  const { t } = useT();
  const { state, reload } = useResource(fetchLoans);
  const [band, setBand] = useState<Band | "">("");
  const [query, setQuery] = useState("");
  const rows = state.status === "ready" ? state.data : [];
  const shown = useMemo(() => filterVisits(rows, band, query), [rows, band, query]);
  const { todo, done } = useMemo(() => splitVisited(shown), [shown]);
  const totals = bandTotals(rows.filter((r) => !r.visited_today));
  const left = rows.filter((r) => !r.visited_today);

  return (
    <Page>
      <div>
        <h1 className="heading-5">{t("officerHome")}</h1>
        {state.status === "ready" && rows.length > 0 && <p className="caption-5">{left.length} {t("visitsCount")}</p>}
      </div>

      {state.status === "loading" && <SkeletonRows />}
      {state.status === "error" && <ErrorState onRetry={reload} />}
      {state.status === "ready" && rows.length === 0 && <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />}

      {state.status === "ready" && rows.length > 0 && (
        <>
          <section className="hero" aria-label={t("toRecover")}>
            <div className="hero-top">
              <span className="hero-icon"><Icon name="hand-coins" size={24} /></span>
              <div>
                <p className="caption-5">{t("toRecover")}</p>
                <p className="heading-5 hero-n">{lakh(totalOutstanding(left))}</p>
              </div>
            </div>
            <StackBar title={t("officerHome")} parts={BANDS.map((b) => ({
              key: b, label: t(BAND_SHORT[b]), value: totals[b], color: `var(--band-${b})`,
            }))} />
          </section>

          <div className="chips" role="group" aria-label={t("officerHome")}>
            <button className="chip" aria-pressed={band === ""} onClick={() => setBand("")}>{t("allStates")} <span className="chip-n">{left.length}</span></button>
            {BANDS.map((b) => (
              <button key={b} className="chip" aria-pressed={band === b} onClick={() => setBand(band === b ? "" : b)}>
                <span className={`dot dot-${b}`} aria-hidden="true" />{t(BAND_SHORT[b])} <span className="chip-n">{totals[b]}</span>
              </button>
            ))}
          </div>

          <label className="search">
            <Icon name="magnifying-glass" size={20} />
            <input className="input search-input" type="search" placeholder={t("searchVisits")} aria-label={t("searchVisits")}
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>

          {shown.length === 0 ? (
            <div className="state">
              <h2 className="title-2">{t("noMatch")}</h2>
              <p className="body-3" style={{ color: "var(--ink-soft)" }}>{t("noMatchBody")}</p>
              <button className="btn btn-quiet" onClick={() => { setQuery(""); setBand(""); }}>{t("clearFilters")}</button>
            </div>
          ) : (
            <>
              <LoanRows rows={todo} t={t} />
              {done.length > 0 && (
                <>
                  <h2 className="body-5 done-h">{t("doneToday")} <span className="chip-n">{done.length}</span></h2>
                  <LoanRows rows={done} t={t} />
                </>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}

function LoanRows({ rows, t }: { rows: LoanRow[]; t: ReturnType<typeof useT>["t"] }) {
  return (
    <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows.map((l, i) => (
        <li key={l.loan_id} className="row-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <Link className={`card row row-${l.band}${l.visited_today ? " row-done" : ""}`} to={`/officer/loans/${encodeURIComponent(l.loan_id)}`}>
            <span className={`dot dot-${l.band}`} role="img" aria-label={t(BAND_LABEL[l.band])} />
            <span className="row-main">
              <span className="body-3 row-name" style={{ display: "block", fontWeight: 500 }}>{l.borrower_name}</span>
              <span className="caption-5">{l.dpd} {t("dpdDays")}</span>
              <span className="meter" aria-hidden="true"><span className={`meter-fill dot-${l.band}`} style={{ width: `${dpdFill(l.dpd)}%` }} /></span>
            </span>
            <span className="row-side">
              {l.visited_today && <span className="pill-done caption-3"><Icon name="check-circle" size={16} />{t("visitedTag")}</span>}
              <span className="body-5">{inr(l.outstanding)}</span>
              <Icon name="caret-right" size={18} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
