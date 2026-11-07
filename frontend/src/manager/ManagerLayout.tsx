import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
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
          <NavLink to="/manager" end>{t("navDashboard")}</NavLink>
          <NavLink to="/manager/loans">{t("navLoans")}</NavLink>
          <NavLink to="/manager/promises">{t("navPromises")}</NavLink>
          <NavLink to="/manager/activity">{t("navActivity")}</NavLink>
          <NavLink to="/manager/import">{t("navImport")}</NavLink>
        </nav>
        <div className="m-side-foot">
          <button className="btn btn-quiet body-5" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t("language")}>
            {lang === "en" ? "हिन्दी" : "English"}
          </button>
          <button className="btn btn-quiet body-5" onClick={signOut}>{t("signOut")}</button>
        </div>
      </aside>
      <main className="m-main"><Outlet /></main>
    </div>
  );
}
