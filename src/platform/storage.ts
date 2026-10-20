// Device-local persistence (no account, no server). Uses localStorage on the web;
// a native variant (e.g. Capacitor Preferences) can replace it later.
// Every access is guarded: private mode or blocked storage must never break the app.

const KEY = "dicefree:session";

export function loadLocal(): unknown {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocal(data: unknown): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable – the session still works in memory
  }
}
