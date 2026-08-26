import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKHQR } from "../src/khqr";

describe("generateKHQR", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns a base64 SVG data URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
    }));
    const result = await generateKHQR({
      emvData: "00020101021229370016test-qr-data", amount: 15.0, currency: "USD", merchantName: "Test Store",
    });
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("uses custom header color", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<svg></svg>") }));
    const result = await generateKHQR({
      emvData: "test-data", amount: 10.0, currency: "USD", merchantName: "Custom Store", headerColor: "#0000ff",
    });
    const svg = atob(result.replace("data:image/svg+xml;base64,", ""));
    expect(svg).toContain("#0000ff");
  });

  it("displays USD amount with dollar sign", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<svg></svg>") }));
    const result = await generateKHQR({
      emvData: "test-data", amount: 99.0, currency: "USD", merchantName: "Store",
    });
    const svg = atob(result.replace("data:image/svg+xml;base64,", ""));
    expect(svg).toContain("$99.00");
  });

  it("formats KHR amounts without decimals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<svg></svg>") }));
    const result = await generateKHQR({
      emvData: "test-data", amount: 61500, currency: "KHR", merchantName: "Store",
    });
    const svg = atob(result.replace("data:image/svg+xml;base64,", ""));
    expect(svg).toContain("61,500");
  });
});
