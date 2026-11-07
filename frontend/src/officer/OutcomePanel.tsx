import { useState, type FormEvent } from "react";
import { currentPosition } from "../outbox/geo";
import { useOutbox } from "../outbox/OutboxContext";
import type { OutcomeResult } from "../outbox/types";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";

const CHOICES: { result: OutcomeResult; label: StringKey }[] = [
  { result: "paid", label: "outPaid" },
  { result: "promise", label: "outPromise" },
  { result: "unreachable", label: "outUnreachable" },
  { result: "dispute", label: "outDispute" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Tap 1: pick the result. Paid / unreachable / dispute save straight away. A promise asks for date and amount. */
export default function OutcomePanel({ loanId }: { loanId: string }) {
  const { t } = useT();
  const { enqueue } = useOutbox();
  const [asking, setAsking] = useState(false);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(result: OutcomeResult, extra: { promise_date?: string; promise_amount?: string } = {}) {
    setSaving(true);
    const pos = await currentPosition();
    await enqueue({ loan_id: loanId, result, lat: pos?.lat, lng: pos?.lng, ...extra });
    setSaving(false);
    setAsking(false); setDate(""); setAmount(""); setError(false);
    setSaved(true);
  }

  function choose(result: OutcomeResult) {
    setSaved(false);
    if (result === "promise") setAsking(true);
    else void save(result);
  }

  function submitPromise(e: FormEvent) {
    e.preventDefault();
    if (!date || date < todayIso() || !(Number(amount) > 0)) { setError(true); return; }
    void save("promise", { promise_date: date, promise_amount: Number(amount).toFixed(2) });
  }

  return (
    <section aria-labelledby="log-h" className="outcome">
      <h2 id="log-h" className="t-label">{t("logOutcome")}</h2>
      {!asking && (
        <div className="outcome-grid">
          {CHOICES.map((c) => (
            <button key={c.result} className="btn btn-quiet" disabled={saving} onClick={() => choose(c.result)}>
              {t(c.label)}
            </button>
          ))}
        </div>
      )}
      {asking && (
        <form className="outcome-form" onSubmit={submitPromise} noValidate>
          <label className="t-label" htmlFor="p-date">{t("promiseDate")}</label>
          <input id="p-date" className="input" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="t-label" htmlFor="p-amt">{t("promiseAmount")}</label>
          <input id="p-amt" className="input" type="number" inputMode="decimal" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {error && <p className="alert-error t-label" role="alert">{t("needDate")}</p>}
          <button className="btn" type="submit" disabled={saving}>{t("saveOutcome")}</button>
          <button className="btn btn-quiet" type="button" onClick={() => { setAsking(false); setError(false); }}>{t("cancel")}</button>
        </form>
      )}
      {saved && <p className="t-label" role="status" style={{ color: "var(--accent-text)" }}>{t("savedLocal")}</p>}
    </section>
  );
}
