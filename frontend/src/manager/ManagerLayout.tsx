import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";
import { useT } from "../i18n/useT";
import "./Manager.css";

export default function ManagerLayout() {
  const { signOut } = useAuth();
  const { t, lang, setLang } = useT();
  return (
    <div className="m-shell">
      <aside className="m-side">
        <span className="title-2">{t("appName")}</span>
        <nav className="m-nav" aria-label="Manager">
          <NavLink to="/manager" end><span className="nav-ic"><Icon name="squares-four" />{t("navDashboard")}</span></NavLink>
          <NavLink to="/manager/loans"><span className="nav-ic"><Icon name="list-bullets" />{t("navLoans")}</span></NavLink>
          <NavLink to="/manager/promises"><span className="nav-ic"><Icon name="handshake" />{t("navPromises")}</span></NavLink>
          <NavLink to="/manager/activity"><span className="nav-ic"><Icon name="pulse" />{t("navActivity")}</span></NavLink>
          <NavLink to="/manager/import"><span className="nav-ic"><Icon name="upload-simple" />{t("navImport")}</span></NavLink>
        </nav>
        <div className="m-side-foot">
          <button className="btn btn-quiet body-5" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t("language")}>
            <Icon name="translate" size={18} />{lang === "en" ? "हिन्दी" : "English"}
          </button>
          <button className="btn btn-quiet body-5" onClick={signOut}><Icon name="sign-out" size={18} />{t("signOut")}</button>
        </div>
      </aside>
      <a className="skip body-5" href="#main">{t("skip")}</a>
      <main className="m-main" id="main"><Outlet /></main>
    </div>
  );
}
