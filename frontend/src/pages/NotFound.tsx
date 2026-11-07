import { Link } from "react-router-dom";
import { useT } from "../i18n/useT";
import "./Login.css";

export default function NotFound() {
  const { t } = useT();
  return (
    <main className="login">
      <section className="card login-card">
        <h1 className="t-title">{t("notFoundTitle")}</h1>
        <p className="t-body" style={{ color: "var(--ink-soft)" }}>{t("notFoundBody")}</p>
        <Link className="btn" to="/">{t("goHome")}</Link>
      </section>
    </main>
  );
}
