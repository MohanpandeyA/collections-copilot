import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/useT";
import { uploadCsv, type ImportSummary } from "./api";

export default function ImportPage() {
  const { session } = useAuth();
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [closeMissing, setCloseMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session || !file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError(t("onlyCsv")); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await uploadCsv(session.token, file, closeMissing));
      setFile(null);
      if (input.current) input.current.value = "";
    } catch {
      setError(t("uploadFailed"));
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1 className="heading-5">{t("importTitle")}</h1>
      <p className="body-3" style={{ color: "var(--ink-soft)", maxWidth: 560 }}>{t("importHelp")}</p>
      <form className="card stat" onSubmit={submit} style={{ maxWidth: 560 }}>
        <label className="body-5" htmlFor="csv">{t("chooseFile")}</label>
        <input id="csv" ref={input} className="input" type="file" accept=".csv,text/csv"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
        <label className="body-5" style={{ display: "flex", gap: "var(--s-8)", alignItems: "flex-start" }}>
          <input type="checkbox" checked={closeMissing} onChange={(e) => setCloseMissing(e.target.checked)} style={{ marginTop: 4 }} />
          <span>{t("closeMissing")}<span className="caption-5" style={{ display: "block" }}>{t("closeMissingHelp")}</span></span>
        </label>
        {error && <p className="alert-error body-5" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={!file || busy}>{busy ? t("uploading") : t("upload")}</button>
      </form>
      {result && (
        <section className="card stat" aria-labelledby="res-h" style={{ maxWidth: 720 }}>
          <h2 id="res-h" className="title-2">{t("importDone")}</h2>
          <p className="body-3">
            {t("loaded")}: {result.loaded} · {t("assigned")}: {result.assigned}
            {result.fallback_count > 0 && ` · ${t("fallback")}: ${result.fallback_count}`}
            {` · ${t("rejected")}: ${result.rejected_count}`}
            {(result.closed ?? 0) > 0 && ` · ${t("closedCount")}: ${result.closed}`}
          </p>
          {result.rejected.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t("row")}</th><th>Loan</th><th>{t("reason")}</th></tr></thead>
                <tbody>{result.rejected.map((r) => (
                  <tr key={`${r.row_number}-${r.loan_id}`}><td>{r.row_number}</td><td>{r.loan_id}</td><td>{r.reason}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
