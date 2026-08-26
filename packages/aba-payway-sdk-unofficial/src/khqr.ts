import type { KHQROptions } from "./types";

const DEFAULT_HEADER_COLOR = "#e63946";
const QR_API_BASE = "https://quickchart.io/qr";

function formatAmount(amount: number, currency: string): string {
  if (currency === "KHR") {
    return amount.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " KHR";
  }
  return "$" + amount.toFixed(2);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function generateKHQR(options: KHQROptions): Promise<string> {
  const {
    emvData,
    amount,
    currency,
    merchantName,
    headerColor = DEFAULT_HEADER_COLOR,
  } = options;

  let qrSvgContent = "";
  try {
    const qrUrl = `${QR_API_BASE}?text=${encodeURIComponent(emvData)}&size=280&margin=1&format=svg`;
    const qrResponse = await fetch(qrUrl);
    if (qrResponse.ok) qrSvgContent = await qrResponse.text();
  } catch { /* fallback: empty QR area */ }

  const innerQr = qrSvgContent
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<svg[^>]*>/g, "")
    .replace(/<\/svg>/g, "");

  const formattedAmount = formatAmount(amount, currency);
  const safeMerchantName = escapeXml(merchantName);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520">
  <defs><clipPath id="qr-clip"><rect x="60" y="140" width="280" height="280" rx="8"/></clipPath></defs>
  <rect width="400" height="520" rx="16" fill="white" stroke="#e0e0e0" stroke-width="1"/>
  <rect width="400" height="80" rx="16" fill="${headerColor}"/>
  <rect y="16" width="400" height="64" fill="${headerColor}"/>
  <text x="200" y="42" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="18" font-weight="bold">${safeMerchantName}</text>
  <text x="200" y="65" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif" font-size="13">KHQR Payment</text>
  <text x="200" y="115" text-anchor="middle" fill="#1a1a1a" font-family="system-ui,sans-serif" font-size="28" font-weight="bold">${formattedAmount}</text>
  <g clip-path="url(#qr-clip)" transform="translate(60,140)">
    ${innerQr || '<rect width="280" height="280" fill="#f5f5f5"/><text x="140" y="140" text-anchor="middle" fill="#999" font-size="14">QR Code</text>'}
  </g>
  <rect x="60" y="140" width="280" height="280" rx="8" fill="none" stroke="#e0e0e0" stroke-width="1"/>
  <text x="200" y="455" text-anchor="middle" fill="#666" font-family="system-ui,sans-serif" font-size="11">Scan with any KHQR-compatible app</text>
  <text x="200" y="475" text-anchor="middle" fill="#999" font-family="system-ui,sans-serif" font-size="10">Powered by Bakong</text>
</svg>`;

  return "data:image/svg+xml;base64," + btoa(svg);
}
