import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import twa from '@twa-dev/sdk'
const WebApp = (twa as any)?.WebApp || twa || {};
import './i18n/config';
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AbaMobileOpenPage } from './components/AbaMobileOpenPage.tsx'
import { ABA_MOBILE_OPEN_PATH } from './utils/abaPaymentLaunch.ts'
import { captureWebLoginFromHash } from './utils/telegramUser'

// Initialize Telegram Web App SDK safely
try {
  const tg = (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) || WebApp;
  tg?.ready?.();
  tg?.expand?.();
} catch (e) {
  console.warn('Telegram init error:', e);
}

const isAbaMobileOpenPage = window.location.pathname === ABA_MOBILE_OPEN_PATH;

if (!isAbaMobileOpenPage) {
  captureWebLoginFromHash();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isAbaMobileOpenPage ? <AbaMobileOpenPage /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
