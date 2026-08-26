import type { HashParams } from "./types";

export async function generateABAHash(
  params: HashParams,
  publicKey: string
): Promise<string> {
  // ABA requires parameters concatenated in this EXACT order
  const hashString = [
    params.req_time,
    params.merchant_id,
    params.tran_id,
    params.amount ?? "",
    params.items ?? "",
    params.shipping ?? "",
    params.ctid ?? "",
    params.pwt ?? "",
    params.firstname ?? "",
    params.lastname ?? "",
    params.email ?? "",
    params.phone ?? "",
    params.type ?? "",
    params.payment_option ?? "",
    params.return_url ?? "",
    params.cancel_url ?? "",
    params.continue_success_url ?? "",
    params.return_deeplink ?? "",
    params.currency ?? "",
    params.custom_fields ?? "",
    params.return_params ?? "",
  ].join("");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(publicKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(hashString));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
