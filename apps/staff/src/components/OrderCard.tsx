import { memo, useEffect, useRef, useState } from 'react';
import {
  Banknote,
  CircleCheck,
  MapPin,
  QrCode,
  TriangleAlert,
  Truck,
} from 'lucide-react';
import { Button, Card } from './ui';
import {
  PAID_STATUSES,
  STATUS_CONFIG,
  elapsedTone,
  formatElapsed,
} from '../lib/orders';
import type { Tone } from '../lib/orders';
import type { Order } from '../types';

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

const TONE_CLASSES: Record<Tone, string> = {
  normal: 'bg-surface-sunken text-ink-soft',
  warn: 'bg-status-pending-soft text-status-pending',
  late: 'bg-danger-soft text-danger',
};

function parseModifiers(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [];
    }
    return Object.values(parsed)
      .filter((value): value is Array<{ name?: string }> => Array.isArray(value))
      .flatMap((options) => options.map((option) => option?.name ?? String(option)));
  } catch {
    return [];
  }
}

function isZhengda(brand: string): boolean {
  return brand.toLowerCase() === 'zhengda';
}

/** Payment is the one fact staff must not get wrong, so it is the loudest pill. */
function PaymentTag({ order }: { order: Order }) {
  const amount = `$${order.totalAmount.toFixed(2)}`;
  const paid = PAID_STATUSES.has(order.status);
  const khqr = order.paymentMethod.toLowerCase() === 'khqr';

  const { Icon, label, classes, note } = paid
    ? {
        Icon: CircleCheck,
        label: 'Paid',
        classes: 'bg-status-ready-soft text-status-ready',
        note: 'Payment received',
      }
    : khqr
      ? {
          Icon: QrCode,
          label: 'KHQR',
          classes: 'bg-status-pending-soft text-status-pending',
          note: 'QR payment not confirmed yet',
        }
      : {
          Icon: Banknote,
          label: 'Cash',
          classes: 'bg-status-pending-soft text-status-pending',
          note: 'Collect cash on handover',
        };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-base font-bold ${classes}`}
      title={note}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      <span className="tabular-nums">{amount}</span>
      <span className="sr-only">— {note}</span>
    </span>
  );
}

function ElapsedTag({
  order,
  now,
}: {
  order: Order;
  now: number;
}) {
  const { label, stale } = formatElapsed(order.createdAt, now);
  const tone = elapsedTone(order.status, order.createdAt, now);
  const spoken = stale
    ? `Placed ${label}, earlier shift`
    : tone === 'late'
      ? `${label} waiting — over target`
      : tone === 'warn'
        ? `${label} waiting — approaching target`
        : `${label} waiting`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${TONE_CLASSES[tone]}`}
    >
      {/* Urgency must survive a red-green colour deficiency, so it carries a glyph too. */}
      {tone !== 'normal' ? (
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

export interface OrderCardProps {
  order: Order;
  now: number;
  updating: boolean;
  isNew: boolean;
  /** True while the board shows more than one branch, so each card must name its own. */
  showBranch: boolean;
  onAction: (id: string, status: string) => void;
  onCancel: (id: string) => void;
  onSeen: (id: string) => void;
}

function OrderCardImpl({
  order,
  now,
  updating,
  isNew,
  showBranch,
  onAction,
  onCancel,
  onSeen,
}: OrderCardProps) {
  const config = STATUS_CONFIG[order.status];
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
    },
    [],
  );

  const handleCancel = () => {
    if (!confirmCancel) {
      // Second tap confirms. A modal for this would block the whole board mid-rush.
      setConfirmCancel(true);
      cancelTimer.current = setTimeout(() => setConfirmCancel(false), 4000);
      return;
    }
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    setConfirmCancel(false);
    onCancel(order.id);
  };

  const cancellable = order.status === 'pending' || order.status === 'paid';

  return (
    <Card
      padding="none"
      // The "new" ring stays until a human touches the card. A 4-second timer
      // expires while nobody is looking at the tablet, which is exactly when a
      // new order is most likely to be missed.
      // shrink-0: the lane is a flex column that scrolls, and without this the
      // cards compress to fit instead of overflowing.
      className={`shrink-0 overflow-hidden ${isNew ? 'ring-2 ring-accent' : ''}`}
      onPointerDown={isNew ? () => onSeen(order.id) : undefined}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="text-3xl leading-none font-bold tracking-tight text-ink">
            {order.pickupCode || '—'}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-faint">
            <span className="tabular-nums">
              {new Date(order.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {showBranch && order.branch?.name ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{order.branch.name}</span>
              </>
            ) : null}
          </p>
        </div>
        <ElapsedTag order={order} now={now} />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <PaymentTag order={order} />
        {/* Pickup is the default for almost every order — only the exception earns a tag. */}
        {order.orderType === 'delivery' ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-status-preparing-soft px-3 py-1.5 text-sm font-semibold text-status-preparing">
            <Truck className="size-4 shrink-0" aria-hidden="true" />
            Delivery
          </span>
        ) : null}
      </div>

      {order.orderType === 'delivery' && order.deliveryAddress ? (
        <div className="mx-4 mt-3 rounded-xl bg-surface-sunken p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
            <MapPin className="size-3.5" aria-hidden="true" />
            Deliver to
          </p>
          {order.deliveryBuilding && order.deliveryRoom ? (
            <p className="mt-1 text-lg leading-tight font-bold text-ink">
              {order.deliveryBuilding}
              {order.deliveryRoom}
            </p>
          ) : null}
          <p className="text-sm text-ink">{order.deliveryAddress}</p>
          {order.contactName || order.contactPhone ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
              {order.contactName ? (
                <span className="text-ink">{order.contactName}</span>
              ) : null}
              {order.contactPhone ? (
                <a
                  href={`tel:${order.contactPhone}`}
                  className="inline-flex min-h-11 items-center font-semibold text-accent hover:text-accent-strong"
                >
                  {order.contactPhone}
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-3 space-y-2.5 px-4">
        {order.items.map((item) => {
          const zhengda = isZhengda(item.menuItem.brand);
          const mods = item.modifiers ? parseModifiers(item.modifiers) : [];
          return (
            <li key={item.id} className="flex items-start gap-2.5">
              {/*
               * Drinks and chicken steak are made at two different stations. The dot
               * lets each station scan a card for only its own lines instead of
               * reading every one. Same pattern as the menu table's brand column.
               */}
              <span
                aria-hidden="true"
                className={`mt-2 size-2.5 shrink-0 rounded-full ${
                  zhengda ? 'bg-zhengda' : 'bg-accent'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base leading-snug font-semibold text-ink">
                    <span className="sr-only">
                      {zhengda ? 'Zhengda' : 'Ai-Cha'}:{' '}
                    </span>
                    {item.quantity}× {item.menuItem.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-faint">
                    ${item.price.toFixed(2)}
                  </span>
                </div>
                {mods.length > 0 ? (
                  <p className="text-sm text-ink-soft">{mods.join(', ')}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center gap-2 border-t border-border p-3">
        {cancellable ? (
          <Button
            variant={confirmCancel ? 'danger' : 'ghost'}
            size="lg"
            onClick={handleCancel}
            aria-label={
              confirmCancel
                ? `Confirm cancelling order ${order.pickupCode ?? ''}`
                : `Cancel order ${order.pickupCode ?? ''}`
            }
          >
            {confirmCancel ? 'Tap to confirm' : 'Cancel'}
          </Button>
        ) : null}
        {config ? (
          <Button
            variant={config.button}
            size="lg"
            fullWidth
            loading={updating}
            data-order-action={order.id}
            onClick={() => onAction(order.id, config.next)}
          >
            {config.buttonLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export const OrderCard = memo(OrderCardImpl);
