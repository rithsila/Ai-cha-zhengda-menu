import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { Button } from './Button';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

interface ToastItem extends ToastOptions {
  id: number;
  exiting: boolean;
}

const AUTO_DISMISS_MS = 5000;
const EXIT_MS = 200;
const MAX_VISIBLE = 3;

const ToastContext = createContext<ToastContextValue | null>(null);

// Hook intentionally lives beside the provider — they share one context and are
// always imported together via the ui barrel. Fast-refresh limitation accepted.
// oxlint-disable-next-line react/only-export-components
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return context;
}

const variantIcons = {
  success: <CheckCircle2 className="size-5 text-success" aria-hidden="true" />,
  error: <CircleAlert className="size-5 text-danger" aria-hidden="true" />,
  info: <Info className="size-5 text-accent" aria-hidden="true" />,
} as const;

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [entered, setEntered] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(AUTO_DISMISS_MS);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = useCallback(
    (ms: number) => {
      clearTimer();
      startedAtRef.current = Date.now();
      timerRef.current = window.setTimeout(() => onDismiss(item.id), ms);
    },
    [item.id, onDismiss],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    startTimer(remainingRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      clearTimer();
    };
  }, [startTimer]);

  const pause = () => {
    clearTimer();
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (Date.now() - startedAtRef.current),
    );
  };

  const resume = () => {
    startTimer(remainingRef.current);
  };

  const visible = entered && !item.exiting;

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={[
        'pointer-events-auto flex w-full max-w-sm items-start gap-3',
        'rounded-xl border border-border bg-surface-raised p-4 shadow-raised',
        'transition-[transform,opacity] duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      ].join(' ')}
    >
      <span className="mt-0.5 shrink-0">
        {variantIcons[item.variant ?? 'info']}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-sm text-ink-soft">{item.description}</p>
        ) : null}
        {item.action ? (
          <Button
            variant="ghost"
            size="md"
            className="-ml-4 mt-1 text-accent hover:text-accent-strong"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
          >
            {item.action.label}
          </Button>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss notification"
        className="-mt-1.5 -mr-1.5 shrink-0"
        onClick={() => onDismiss(item.id)}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, exiting: true } : item,
      ),
    );
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id));
    }, EXIT_MS);
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextIdRef.current++;
    setToasts((previous) =>
      [...previous, { ...options, id, exiting: false }].slice(-MAX_VISIBLE),
    );
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
