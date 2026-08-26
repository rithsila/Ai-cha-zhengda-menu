import type { PurchaseItem } from "./types";

export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `EA${timestamp}${random}`.substring(0, 20);
}

// ABA expects req_time in UTC (YYYYMMDDHHmmss). Using the server's local clock
// makes the request look expired from any machine that is not set to UTC.
export function getABATimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds())
  );
}

export function formatPhoneForABA(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/[\s-]/g, "");
  if (cleaned.startsWith("+855")) return "0" + cleaned.slice(4);
  if (cleaned.startsWith("855")) return "0" + cleaned.slice(3);
  return cleaned;
}

export function getQRExpiration(): Date {
  return new Date(Date.now() + 15 * 60 * 1000);
}

/**
 * Base64 for arbitrary text. `btoa` alone throws on anything outside Latin-1,
 * and item names here can be Khmer or Chinese, so encode to UTF-8 bytes first.
 */
export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * ABA wants `items` as base64-encoded JSON. An array is encoded; a string is
 * passed through unchanged so existing callers keep working.
 */
export function encodeItemsForABA(
  items: string | readonly PurchaseItem[] | undefined
): string {
  if (items == null) return "";
  if (typeof items === "string") return items;
  return toBase64Utf8(JSON.stringify(items));
}
