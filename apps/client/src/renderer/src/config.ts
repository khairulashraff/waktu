import { showToast } from "./toast";

// Base URL of the Waktu API, baked into the build. Set VITE_API_BASE in the
// client's .env (e.g. http://<host>:3000) before `pnpm build:client`; Vite
// inlines it at build time. Falls back to the LAN default when unset (dev).
// `||` (not `??`) so an empty VITE_API_BASE (e.g. passed through as "") still
// falls back to the default rather than yielding a broken empty base URL.
export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:3000";

// Small typed GET helper over the native fetch. Throws on a non-2xx response so
// callers' existing try/catch (retry) paths fire the same way they did with axios.
// Any failure (unreachable API, non-2xx, bad JSON) is surfaced as a toast showing
// the full URL — so a wrong API base (e.g. localhost instead of the deploy host)
// is visible on the device, not just silently retried.
export async function fetchJson<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    showToast(`API error: ${url} — ${detail}`);
    throw err;
  }
}
