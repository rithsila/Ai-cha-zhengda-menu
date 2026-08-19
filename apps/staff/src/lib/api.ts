/**
 * Shared API client for the staff dashboard.
 *
 * NOTE: the base URL is hardcoded for local development (same convention as
 * apps/menu). Point this at the real deployment URL for any non-local deploy.
 */
export const API_BASE = 'http://localhost:4000';

/**
 * Fetch from the API and parse JSON. Throws on any non-2xx response so callers
 * can rely on try/catch for error handling (never swallow into console.error).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const err = new Error(`API ${init?.method ?? 'GET'} ${path} → ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}
