import { useRef, useState, type FormEvent } from "react";
import { currentPosition } from "../outbox/geo";
import { useOutbox } from "../outbox/OutboxContext";
import type { OutcomeResult } from "../outbox/types";
import { Icon, type IconName } from "../components/Icon";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";

const CHOICES: { result: OutcomeResult; label: StringKey; icon: IconName }[] = [
  { result: "paid", label: "outPaid", icon: "check-circle" },
  { result: "promise", label: "outPromise", icon: "handshake" },
  { result: "unreachable", label: "outUnreachable", icon: "phone-slash" },
  { result: "dispute", label: "outDispute", icon: "scales" },
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
  // A ref, not state: state updates after a render, so two quick taps could both get through.
  const busy = useRef(false);

  async function save(result: OutcomeResult, extra: { promise_date?: string; promise_amount?: string } = {}) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const pos = await currentPosition();
      await enqueue({ loan_id: loanId, result, lat: pos?.lat, lng: pos?.lng, ...extra });
      setAsking(false); setDate(""); setAmount(""); setError(false);
      setSaved(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function choose(result: OutcomeResult) {
    if (busy.current) return;
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
      <h2 id="log-h" className="body-5">{t("logOutcome")}</h2>
      {!asking && !saved && (
        <div className="outcome-grid">
          {CHOICES.map((c) => (
            <button key={c.result} className={`btn btn-tint tint-${c.result}`} disabled={saving} onClick={() => choose(c.result)}>
              <Icon name={c.icon} />{t(c.label)}
            </button>
          ))}
        </div>
      )}
      {asking && (
        <form className="outcome-form" onSubmit={submitPromise} noValidate>
          <label className="body-5" htmlFor="p-date">{t("promiseDate")}</label>
          <input id="p-date" className="input" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="body-5" htmlFor="p-amt">{t("promiseAmount")}</label>
          <input id="p-amt" className="input" type="number" inputMode="decimal" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {error && <p className="alert-error body-5" role="alert">{t("needDate")}</p>}
          <button className="btn" type="submit" disabled={saving}>{t("saveOutcome")}</button>
          <button className="btn btn-quiet" type="button" onClick={() => { setAsking(false); setError(false); }}>{t("cancel")}</button>
        </form>
      )}
      {saved && (
        <>
          <p className="body-5" role="status" style={{ color: "var(--accent-text)" }}>{t("savedLocal")}</p>
          <button className="btn btn-quiet" onClick={() => setSaved(false)}>{t("logAnother")}</button>
        </>
      )}
    </section>
  );
}
