export type Role = "officer" | "manager";
export type Lang = "en" | "hi";
export type Session = { token: string; role: Role; language: Lang };

const KEY = "cc.session";

// localStorage can throw (private mode, blocked storage), so every access is guarded.
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* keep going in memory */ }
}

export function clearSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
