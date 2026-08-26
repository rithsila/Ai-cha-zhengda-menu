import { describe, it, expect } from "vitest";
import { generateABAHash } from "../src/hash";
import type { HashParams } from "../src/types";

describe("generateABAHash", () => {
  it("produces a base64 HMAC-SHA512 hash", async () => {
    const params: HashParams = {
      req_time: "20260525153000",
      merchant_id: "TEST_MERCHANT",
      tran_id: "TXN001",
      amount: "15.00",
      currency: "USD",
    };
    const hash = await generateABAHash(params, "test_public_key");
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("produces same hash for same inputs (deterministic)", async () => {
    const params: HashParams = {
      req_time: "20260101120000",
      merchant_id: "M001",
      tran_id: "T001",
      amount: "10.00",
      items: "Plan",
      firstname: "John",
      lastname: "Doe",
      email: "john@test.com",
      phone: "012345678",
      currency: "USD",
    };
    const hash1 = await generateABAHash(params, "key1");
    const hash2 = await generateABAHash(params, "key1");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different keys", async () => {
    const params: HashParams = {
      req_time: "20260101120000",
      merchant_id: "M001",
      tran_id: "T001",
    };
    const hash1 = await generateABAHash(params, "key_a");
    const hash2 = await generateABAHash(params, "key_b");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty optional fields as empty strings", async () => {
    const params: HashParams = {
      req_time: "20260101120000",
      merchant_id: "M001",
      tran_id: "T001",
    };
    const hash = await generateABAHash(params, "test_key");
    expect(hash).toBeTruthy();
  });
});
