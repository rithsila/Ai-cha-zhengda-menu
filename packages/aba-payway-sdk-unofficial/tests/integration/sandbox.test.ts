// Integration tests against the live ABA PayWay sandbox.
//
// These tests make REAL network calls, so they are opt-in:
// they run only when sandbox credentials are present in the
// environment. Copy ".env.example" to ".env", fill in your
// sandbox values, then run:  npm run test:sandbox
//
// Without credentials the whole suite is skipped, so the
// default "npm test" stays green in CI.

import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { ABAPayWay } from "../../src/client";
import { generateTransactionId } from "../../src/utils";

const merchantId = process.env.ABA_MERCHANT_ID;
const apiKey = process.env.ABA_API_KEY;
const baseUrl = process.env.ABA_BASE_URL;

const hasCredentials = Boolean(merchantId && apiKey && baseUrl);

// ABA returns code 21 with "End of API lifetime" when the API key
// has passed its valid-until date.
function isExpiredCredential(error: string | undefined): boolean {
  if (!error) return false;
  return error.includes('"code":21') || error.includes("End of API lifetime");
}

const EXPIRED_MESSAGE =
  "ABA credential expired (code 21: End of API lifetime). " +
  "Request a new sandbox key from ABA and update ABA_API_KEY in .env.";

if (!hasCredentials) {
  // Make the skip reason visible when running the sandbox suite.
  console.warn(
    "[sandbox] Skipping integration tests: set ABA_MERCHANT_ID, ABA_API_KEY, and ABA_BASE_URL in .env",
  );
}

// describe.skipIf keeps the suite green when no credentials are set.
describe.skipIf(!hasCredentials)("ABA PayWay sandbox (live)", () => {
  // Built in beforeAll so a skipped suite never touches the
  // (absent) credentials. A skipped suite runs no hooks.
  let aba: ABAPayWay;

  beforeAll(() => {
    aba = new ABAPayWay({
      merchantId: merchantId!,
      apiKey: apiKey!,
      baseUrl: baseUrl!,
      webhookSecret: process.env.ABA_WEBHOOK_SECRET,
    });
  });

  // A single transaction ID shared by both tests in this run.
  const transactionId = generateTransactionId();

  // Set by the purchase test when ABA reports an expired key, so the
  // status test can fail fast with the same clear message instead of
  // making a second pointless call (checkStatus hides ABA's code 21
  // behind a generic "Unknown error").
  let credentialExpired = false;

  it(
    "creates a purchase and returns a checkout URL and QR string",
    async () => {
      const result = await aba.createPurchase({
        transactionId,
        amount: 1.0,
        currency: "USD",
        items: "Sandbox Test Item",
        firstName: "Sandbox",
        lastName: "Tester",
        email: "sandbox@example.com",
        returnUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      // ABA code 21 ("End of API lifetime") means the API key has
      // expired. Fail with a clear, actionable message instead of a
      // raw HTTP 403 dump.
      if (isExpiredCredential(result.error)) {
        credentialExpired = true;
        throw new Error(EXPIRED_MESSAGE);
      }

      // If this fails, the error string tells you what ABA rejected
      // (e.g. "Wrong Hash" means bad API key or merchant ID).
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.checkoutUrl).toBeTruthy();
      expect(result.qrString).toBeTruthy();
    },
    20_000, // real network call: allow up to 20s
  );

  it(
    "checks status of the new transaction and reports PENDING",
    async () => {
      // The purchase test already proved the key is expired; don't
      // make a second call that would just surface a vague error.
      if (credentialExpired) {
        throw new Error(EXPIRED_MESSAGE);
      }

      const result = await aba.checkStatus(transactionId);

      if (isExpiredCredential(result.error)) {
        throw new Error(EXPIRED_MESSAGE);
      }

      expect(result.success).toBe(true);
      // An unpaid sandbox transaction stays PENDING until you pay
      // it via the checkout URL.
      expect(result.status).toBe("PENDING");
    },
    20_000,
  );
});
