import { useState } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/useT";
import { createDraft, sendDraft, type Draft } from "./api";

type Msg = { kind: "ok" | "err"; text: string };

/** The officer always sees the text and taps send. Nothing goes out automatically. */
export default function ReminderPanel({ loanId }: { loanId: string }) {
  const { session } = useAuth();
  const { t, lang } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function make(useAi: boolean) {
    if (!session) return;
    setBusy("draft"); setMsg(null);
    try {
      setDraft(await createDraft(session.token, loanId, lang, useAi));
    } catch {
      setDraft(null); setMsg({ kind: "err", text: t("draftFailed") });
    } finally { setBusy(null); }
  }

  async function send(channel: "sms" | "whatsapp") {
    if (!session || !draft) return;
    setBusy("send"); setMsg(null);
    try {
      await sendDraft(session.token, draft.id, channel);
      setMsg({ kind: "ok", text: t("sentOk") });
      setDraft(null);
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError && err.status === 409 ? t("sendBlocked") : t("sendFailed") });
    } finally { setBusy(null); }
  }

  return (
    <section aria-labelledby="rem-h" className="outcome">
      <h2 id="rem-h" className="t-label">{t("reminderTitle")}</h2>
      <div className="outcome-grid">
        <button className="btn btn-quiet" disabled={busy !== null} onClick={() => make(false)}>
          {busy === "draft" ? t("drafting") : t("draftTemplate")}
        </button>
        <button className="btn btn-quiet" disabled={busy !== null} onClick={() => make(true)}>{t("draftAi")}</button>
      </div>
      {draft && (
        <div className="card draft">
          <p className="t-body" lang={draft.language}>{draft.text}</p>
          <p className="t-caption">{t(draft.source === "llm" ? "draftSource_llm" : "draftSource_template")}</p>
          {draft.note && <p className="t-caption" style={{ color: "var(--accent-text)" }}>{draft.note}</p>}
          <div className="outcome-grid">
            <button className="btn" disabled={busy !== null} onClick={() => send("sms")}>{busy === "send" ? t("sending") : t("sendSms")}</button>
            <button className="btn" disabled={busy !== null} onClick={() => send("whatsapp")}>{t("sendWhatsapp")}</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.kind === "err" ? "alert-error t-label" : "t-label"} role={msg.kind === "err" ? "alert" : "status"}
        style={msg.kind === "ok" ? { color: "var(--accent-text)" } : undefined}>{msg.text}</p>}
    </section>
  );
}
