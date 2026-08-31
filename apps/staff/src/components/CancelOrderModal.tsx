import { useState } from 'react';
import { X, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from './ui';
import type { Order } from '../types';

const PRESET_REASONS = [
  'Item / Ingredient out of stock',
  'Customer requested cancellation',
  'Store / Kitchen closed',
  'Duplicate or incorrect order details',
];

interface CancelOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (orderId: string, reason: string) => void;
  loading?: boolean;
}

export function CancelOrderModal({
  order,
  isOpen,
  onClose,
  onConfirm,
  loading = false,
}: CancelOrderModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');

  if (!isOpen || !order) return null;

  const finalReason =
    selectedReason === 'custom'
      ? customReason.trim()
      : selectedReason;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalReason) return;
    onConfirm(order.id, finalReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={loading ? undefined : onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md rounded-none border border-border bg-surface p-5 shadow-2xl z-10 space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="size-5 shrink-0" />
            <h3 className="text-base font-extrabold text-ink">
              Cancel Order {order.pickupCode ? `#${order.pickupCode}` : ''}
            </h3>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-none p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="text-xs text-ink-soft">
          Select or enter a reason. The customer will see this message on their Telegram ticket.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              Reason for Cancellation
            </label>
            <div className="space-y-1.5">
              {PRESET_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    className={`flex w-full items-center justify-between rounded-none border px-3.5 py-2.5 text-left text-xs font-semibold transition-all ${
                      isSelected
                        ? 'border-danger bg-danger-soft text-danger font-bold'
                        : 'border-border bg-surface-sunken/40 text-ink hover:bg-surface-sunken'
                    }`}
                  >
                    <span>{reason}</span>
                    {isSelected ? (
                      <span className="size-2 rounded-none bg-danger" />
                    ) : null}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setSelectedReason('custom')}
                className={`flex w-full items-center justify-between rounded-none border px-3.5 py-2.5 text-left text-xs font-semibold transition-all ${
                  selectedReason === 'custom'
                    ? 'border-danger bg-danger-soft text-danger font-bold'
                    : 'border-border bg-surface-sunken/40 text-ink hover:bg-surface-sunken'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="size-3.5" />
                  Custom reason...
                </span>
                {selectedReason === 'custom' ? (
                  <span className="size-2 rounded-none bg-danger" />
                ) : null}
              </button>
            </div>
          </div>

          {selectedReason === 'custom' ? (
            <div className="space-y-1 pt-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                Enter Custom Reason
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="e.g. Milk tea base is finishing, takes 30 mins to brew..."
                rows={2}
                required
                className="w-full rounded-none border border-border bg-surface-sunken/50 p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-danger focus:outline-none"
              />
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={loading}
              onClick={onClose}
            >
              Keep Order
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="md"
              loading={loading}
              disabled={!finalReason}
            >
              Confirm Cancellation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
