import { Link } from "react-router-dom";
import { useT } from "../i18n/useT";
import "./Login.css";

export default function NotFound() {
  const { t } = useT();
  return (
    <main className="login">
      <section className="card login-card">
        <h1 className="heading-5">{t("notFoundTitle")}</h1>
        <p className="body-3" style={{ color: "var(--ink-soft)" }}>{t("notFoundBody")}</p>
        <Link className="btn" to="/">{t("goHome")}</Link>
      </section>
    </main>
  );
}
