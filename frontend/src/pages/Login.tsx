import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/useT";
import "./Login.css";

export default function Login() {
  const { session, signIn } = useAuth();
  const { t, lang, setLang } = useT();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to={session.role === "manager" ? "/manager" : "/officer"} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await signIn(username.trim(), password);
      setLang(next.language);
      navigate(next.role === "manager" ? "/manager" : "/officer", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t("badLogin"));
      else if (err instanceof ApiError && err.status === 429) setError(t("tooManyLogins"));
      else if (err instanceof ApiError && err.status === 0) setError(t("offline"));
      else setError(t("serverError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="card login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 32 32"><path d="M9 17l5 5 9-11" fill="none" stroke="#2B2118" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="title-2">{t("appName")}</span>
        </div>
        <div>
          <h1 id="login-title" className="heading-5">{t("loginTitle")}</h1>
          <p className="body-3" style={{ color: "var(--ink-soft)" }}>{t("loginIntro")}</p>
        </div>
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="body-5" htmlFor="username">{t("username")}</label>
            <input id="username" className="input" autoComplete="username" autoCapitalize="none"
              value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label className="body-5" htmlFor="password">{t("password")}</label>
            <input id="password" className="input" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="alert-error body-5" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={busy || !username || !password}>
            {busy ? t("signingIn") : t("signIn")}
          </button>
        </form>
        <div className="login-lang" role="group" aria-label={t("language")}>
          <button type="button" className="lang-btn body-5" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
          <button type="button" className="lang-btn body-5" aria-pressed={lang === "hi"} onClick={() => setLang("hi")}>हिन्दी</button>
        </div>
      </section>
    </main>
  );
}
