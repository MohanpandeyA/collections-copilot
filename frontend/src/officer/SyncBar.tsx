import { useOutbox } from "../outbox/OutboxContext";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";

const LABEL: Record<string, StringKey> = {
  paid: "outcomeLabelPaid", promise: "outcomeLabelPromise",
  unreachable: "outcomeLabelUnreachable", dispute: "outcomeLabelDispute",
};

/** Shows what is still on the phone. Hidden when everything is synced, so it never nags. */
export default function SyncBar() {
  const { t } = useT();
  const { pending, failed, syncing, syncNow, items, dismiss } = useOutbox();
  if (pending === 0 && failed === 0) return null;
  return (
    <div className="syncbar" role="status">
      <div className="syncbar-head">
        <span className="body-5">
          {pending > 0 && `${pending} ${t("syncPending")}`}{pending > 0 && failed > 0 && " · "}
          {failed > 0 && `${failed} ${t("syncFailed")}`}
        </span>
        {pending > 0 && (
          <button className="btn btn-quiet body-5" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? t("syncing") : t("syncNow")}
          </button>
        )}
      </div>
      {items.filter((i) => i.status === "failed").map((i) => (
        <p key={i.client_id} className="alert-error caption-5">
          {i.loan_id} · {t(LABEL[i.result])}: {i.reason}
          <button className="btn btn-quiet caption-5" onClick={() => void dismiss(i.client_id)}>{t("dismiss")}</button>
        </p>
      ))}
    </div>
  );
}
