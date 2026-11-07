import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/useT";
import { OutboxProvider } from "../outbox/OutboxContext";
import SyncBar from "./SyncBar";
import "./Officer.css";

export default function OfficerLayout() {
  return (
    <OutboxProvider>
      <Shell />
    </OutboxProvider>
  );
}

function Shell() {
  const { signOut } = useAuth();
  const { t, lang, setLang } = useT();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/officer" className="t-heading" style={{ textDecoration: "none", color: "inherit" }}>{t("appName")}</Link>
        <div className="topbar-actions">
          <button className="btn btn-quiet t-label" onClick={() => setLang(lang === "en" ? "hi" : "en")}
            aria-label={t("language")}>{lang === "en" ? "हिन्दी" : "English"}</button>
          <button className="btn btn-quiet t-label" onClick={signOut}>{t("signOut")}</button>
        </div>
      </header>
      <SyncBar />
      <main><Outlet /></main>
    </div>
  );
}
