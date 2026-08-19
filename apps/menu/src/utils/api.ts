/**
 * Base URL of the backend API.
 *
 * Set VITE_API_URL when the API is not on localhost — every deployed build
 * needs it, because the browser cannot reach the developer's machine.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000';
