import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import twa from '@twa-dev/sdk'
const WebApp = (twa as any)?.WebApp || twa || {};
import './i18n/config';
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { captureWebLoginFromHash } from './utils/telegramUser'

// Initialize Telegram Web App SDK
WebApp?.ready?.();
captureWebLoginFromHash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

