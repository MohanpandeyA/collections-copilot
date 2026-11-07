import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { clearSession, loadSession, saveSession, type Lang, type Role, type Session } from "./session";

type LoginResponse = { access_token: string; role: Role; language: Lang };
type Ctx = {
  session: Session | null;
  signIn: (username: string, password: string) => Promise<Session>;
  signOut: () => void;
};
const Auth = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);

  const signIn = async (username: string, password: string) => {
    const res = await api<LoginResponse>("/auth/login", "POST", { form: { username, password } });
    const next: Session = { token: res.access_token, role: res.role, language: res.language };
    saveSession(next);
    setSession(next);
    return next;
  };
  const signOut = () => {
    clearSession();
    setSession(null);
  };
  return <Auth.Provider value={{ session, signIn, signOut }}>{children}</Auth.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(Auth);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
