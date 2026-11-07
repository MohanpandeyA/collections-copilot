import { Link, Outlet } from "react-router-dom";
import { Icon } from "../components/Icon";
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
        <Link to="/officer" className="brand title-2"><span className="brand-mark"><Icon name="hand-coins" size={20} /></span>{t("appName")}</Link>
        <div className="topbar-actions">
          <button className="btn btn-quiet body-5" onClick={() => setLang(lang === "en" ? "hi" : "en")}
            aria-label={t("language")}><Icon name="translate" size={18} />{lang === "en" ? "हिन्दी" : "English"}</button>
          <button className="btn btn-quiet body-5" onClick={signOut}><Icon name="sign-out" size={18} /><span className="hide-sm">{t("signOut")}</span></button>
        </div>
      </header>
      <SyncBar />
      <main><Outlet /></main>
    </div>
  );
}
