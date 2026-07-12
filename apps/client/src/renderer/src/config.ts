// Base URL of the Waktu API, baked into the build. Set VITE_API_BASE in the
// client's .env (e.g. http://<host>:3000) before `pnpm build:client`; Vite
// inlines it at build time. Falls back to the LAN default when unset (dev).
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

// Small typed GET helper over the native fetch. Throws on a non-2xx response so
// callers' existing try/catch (retry) paths fire the same way they did with axios.
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}
