import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ABAPayWay } from "../src/client";

const TEST_CONFIG = {
  merchantId: "TEST_MERCHANT",
  apiKey: "TEST_API_KEY",
  baseUrl: "https://checkout-sandbox.payway.com.kh",
} as const;

describe("ABAPayWay", () => {
  let aba: ABAPayWay;
  beforeEach(() => { aba = new ABAPayWay(TEST_CONFIG); });

  describe("constructor", () => {
    it("stores config immutably", () => {
      expect(aba.config.merchantId).toBe("TEST_MERCHANT");
    });
    it("throws if merchantId is missing", () => {
      expect(() => new ABAPayWay({ merchantId: "", apiKey: "key", baseUrl: "https://example.com" })).toThrow("merchantId is required");
    });
    it("throws if apiKey is missing", () => {
      expect(() => new ABAPayWay({ merchantId: "id", apiKey: "", baseUrl: "https://example.com" })).toThrow("apiKey is required");
    });
  });

  describe("createPurchase", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      const payload = {
        status: 0, description: "Success",
        checkout_url: "https://checkout-sandbox.payway.com.kh/checkout/abc123",
        abapay_deeplink: "abapay://pay?token=abc123",
        qr_string: "00020101021229370016KHQR-MOCK-DATA",
      };
      fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(payload)),
        json: () => Promise.resolve(payload),
      });
      vi.stubGlobal("fetch", fetchSpy);
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it("calls the purchase endpoint", async () => {
      const result = await aba.createPurchase({
        transactionId: "EA001", amount: 15.0, currency: "USD",
        items: "Monthly Plan", firstName: "John", lastName: "Doe",
        email: "john@test.com", phone: "012345678",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toContain("/api/payment-gateway/v1/payments/purchase");
      expect(result.success).toBe(true);
      expect(result.checkoutUrl).toContain("checkout");
    });

    // ABA only returns qr_string / abapay_deeplink when payment_option asks
    // for KHQR, and it expects items as base64 JSON.
    it("sends payment_option and base64-encoded items", async () => {
      const items = [{ name: "Milk Tea", quantity: 2, price: 2.5 }];
      await aba.createPurchase({
        transactionId: "EA003", amount: 5.0, currency: "USD",
        items, paymentOption: "abapay_khqr",
      });
      const body = new URLSearchParams(fetchSpy.mock.calls[0][1].body as string);
      expect(body.get("payment_option")).toBe("abapay_khqr");
      expect(JSON.parse(atob(body.get("items")!))).toEqual(items);
    });

    // Bad credentials get an HTML error page back, not JSON. Parsing that
    // blindly produced "Unexpected token '<'", which hides the real cause.
    it("explains a non-JSON reply instead of leaking a parse error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true, status: 200,
        text: () => Promise.resolve("<!DOCTYPE html><html><body>Forbidden</body></html>"),
      });
      const result = await aba.createPurchase({ transactionId: "EA004", amount: 1.0, currency: "USD" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("non-JSON");
      expect(result.error).toContain("merchant ID or API key");
    });

    it("returns error when API fails", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false, status: 500, text: () => Promise.resolve("Server error"),
      });
      const result = await aba.createPurchase({ transactionId: "EA002", amount: 15.0, currency: "USD" });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe("checkStatus", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      const payload = { status: 0, description: "APPROVED", payment_status: "APPROVED", amount: "15.00" };
      fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(payload)),
        json: () => Promise.resolve(payload),
      });
      vi.stubGlobal("fetch", fetchSpy);
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it("calls check-transaction endpoint", async () => {
      const result = await aba.checkStatus("EA001");
      expect(fetchSpy.mock.calls[0][0]).toContain("/api/payment-gateway/v1/payments/check-transaction-2");
      expect(result.success).toBe(true);
      expect(result.status).toBe("APPROVED");
    });
  });

  describe("verifyWebhook", () => {
    it("returns true for valid signature", async () => {
      const payload = '{"event_type":"PAYMENT_SUCCESS"}';
      const secret = "test_secret";
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const validSig = btoa(String.fromCharCode(...new Uint8Array(sig)));
      expect(await aba.verifyWebhook(payload, validSig, secret)).toBe(true);
    });
    it("returns false for invalid signature", async () => {
      expect(await aba.verifyWebhook('{"event":"test"}', "invalid", "secret")).toBe(false);
    });
  });
});
