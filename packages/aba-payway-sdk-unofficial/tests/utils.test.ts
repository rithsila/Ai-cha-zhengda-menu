import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateTransactionId,
  getABATimestamp,
  formatPhoneForABA,
  getQRExpiration,
  toBase64Utf8,
  encodeItemsForABA,
} from "../src/utils";

describe("generateTransactionId", () => {
  it("returns a string with EA prefix", () => {
    expect(generateTransactionId().startsWith("EA")).toBe(true);
  });
  it("is at most 20 characters long", () => {
    expect(generateTransactionId().length).toBeLessThanOrEqual(20);
  });
  it("contains only alphanumeric characters", () => {
    expect(generateTransactionId()).toMatch(/^[A-Za-z0-9]+$/);
  });
  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTransactionId()));
    expect(ids.size).toBe(100);
  });
});

describe("getABATimestamp", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("returns a 14-character YYYYMMDDHHmmss string", () => {
    expect(getABATimestamp()).toMatch(/^\d{14}$/);
  });

  // ABA rejects a req_time that looks stale. Reading the local clock made the
  // timestamp wrong by the server's UTC offset — 7 hours in Cambodia.
  it("uses UTC, not the local timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T05:06:07Z"));
    expect(getABATimestamp()).toBe("20260304050607");
  });
});

describe("formatPhoneForABA", () => {
  it("converts +855 prefix to 0", () => {
    expect(formatPhoneForABA("+855123456")).toBe("0123456");
  });
  it("converts 855 prefix to 0", () => {
    expect(formatPhoneForABA("855123456")).toBe("0123456");
  });
  it("keeps 0-prefixed numbers unchanged", () => {
    expect(formatPhoneForABA("012345678")).toBe("012345678");
  });
  it("strips spaces and dashes", () => {
    expect(formatPhoneForABA("012 345-678")).toBe("012345678");
  });
  it("returns empty string for empty input", () => {
    expect(formatPhoneForABA("")).toBe("");
  });
});

describe("toBase64Utf8", () => {
  it("encodes plain ASCII", () => {
    expect(toBase64Utf8("hello")).toBe("aGVsbG8=");
  });
  // btoa alone throws on anything outside Latin-1, and this shop's menu is
  // partly Khmer and Chinese.
  it("encodes non-Latin text without throwing", () => {
    expect(() => toBase64Utf8("តែទឹកដោះគោ 珍珠奶茶")).not.toThrow();
    expect(toBase64Utf8("珍珠")).toBe("54+N54+g");
  });
});

describe("encodeItemsForABA", () => {
  it("base64-encodes an items array as JSON", () => {
    const items = [{ name: "Milk Tea", quantity: 2, price: 2.5 }];
    const encoded = encodeItemsForABA(items);
    expect(JSON.parse(atob(encoded))).toEqual(items);
  });
  it("passes a string through unchanged", () => {
    expect(encodeItemsForABA("already-encoded")).toBe("already-encoded");
  });
  it("returns an empty string when items are missing", () => {
    expect(encodeItemsForABA(undefined)).toBe("");
  });
});

describe("getQRExpiration", () => {
  it("returns a date 15 minutes in the future", () => {
    const now = Date.now();
    const diff = getQRExpiration().getTime() - now;
    expect(diff).toBeGreaterThan(14 * 60 * 1000);
    expect(diff).toBeLessThan(16 * 60 * 1000);
  });
});
