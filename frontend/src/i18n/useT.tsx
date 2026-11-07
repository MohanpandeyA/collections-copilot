import { createContext, useContext, useState, type ReactNode } from "react";
import type { Lang } from "../auth/session";
import { strings, type StringKey } from "./strings";

const LANG_KEY = "cc.lang";

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "en" || v === "hi") return v;
  } catch { /* use default */ }
  return "en";
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string };
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch { /* not persisted */ }
  };
  const t = (k: StringKey) => strings[lang][k];
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(I18n);
  if (!ctx) throw new Error("useT must be used inside I18nProvider");
  return ctx;
}
