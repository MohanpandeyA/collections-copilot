import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/useT";

/** Temporary landing screen so a signed-in user sees something real: who they are and a working sign out. */
export default function Home({ titleKey }: { titleKey: "officerHome" | "managerHome" }) {
  const { signOut } = useAuth();
  const { t } = useT();
  return (
    <main style={{ padding: "var(--s-24) var(--s-16)", display: "flex", flexDirection: "column", gap: "var(--s-16)", alignItems: "flex-start" }}>
      <h1 className="t-title">{t(titleKey)}</h1>
      <button className="btn btn-quiet" onClick={signOut}>{t("signOut")}</button>
    </main>
  );
}
