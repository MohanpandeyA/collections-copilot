import type { ReactNode } from "react";
import { useT } from "../i18n/useT";

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="state" role="alert">
      <p className="body-3">{t("loadError")}</p>
      <button className="btn btn-quiet" onClick={onRetry}>{t("retry")}</button>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="state">
      <h2 className="title-2">{title}</h2>
      <p className="body-3" style={{ color: "var(--ink-soft)" }}>{body}</p>
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="list">
      {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}
