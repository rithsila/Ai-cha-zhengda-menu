import { useEffect, useState } from 'react';
import { isValidAbaMobileDeeplink } from '../utils/abaPaymentLaunch';

function readDeeplink(): string | null {
  const deeplink = new URLSearchParams(window.location.search).get('deeplink');
  if (!deeplink || !isValidAbaMobileDeeplink(deeplink)) return null;
  return deeplink;
}

export function AbaMobileOpenPage() {
  const [deeplink] = useState(readDeeplink);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!deeplink) return;
    const timer = window.setTimeout(() => {
      setAttempted(true);
      window.location.href = deeplink;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [deeplink]);

  const openAbaMobile = () => {
    if (!deeplink) return;
    setAttempted(true);
    window.location.href = deeplink;
  };

  return (
    <main className="min-h-[100dvh] bg-[#F7F7F5] text-[#171717] flex items-center justify-center px-5">
      <section className="w-full max-w-sm rounded-2xl bg-white border border-black/10 shadow-sm p-5 text-center">
        <img
          src="/images/aba-logo.png"
          alt="ABA Mobile"
          className="w-16 h-16 rounded-2xl object-cover mx-auto shadow-sm"
        />
        <h1 className="mt-4 text-xl font-extrabold">Open ABA Mobile</h1>
        <p className="mt-2 text-sm leading-6 text-black/60">
          Continue in ABA Mobile to approve your Ai-Cha & Zhengda payment.
        </p>

        {deeplink ? (
          <button
            type="button"
            onClick={openAbaMobile}
            className="mt-5 w-full rounded-2xl bg-[#005BAA] text-white py-3.5 px-4 text-sm font-bold active:scale-[0.98] transition"
          >
            Open ABA Mobile
          </button>
        ) : (
          <p className="mt-5 rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-700">
            This payment link is invalid. Return to Telegram and try again.
          </p>
        )}

        {attempted && (
          <p className="mt-3 text-xs leading-5 text-black/50">
            If ABA Mobile does not open, return to Telegram and use the KHQR option.
          </p>
        )}
      </section>
    </main>
  );
}
