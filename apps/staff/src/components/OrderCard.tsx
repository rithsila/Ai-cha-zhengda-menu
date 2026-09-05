import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Banknote,
  Building2,
  CircleCheck,
  Hourglass,
  MapPin,
  Phone,
  QrCode,
  ShoppingBag,
  TriangleAlert,
  Truck,
  User,
} from 'lucide-react';
import { Button, Card } from './ui';
import {
  PAID_STATUSES,
  STATUS_CONFIG,
  elapsedTone,
  formatCountdown,
  formatElapsed,
  isAwaitingPayment,
  parseModifiers,
  paymentExpiryAt,
} from '../lib/orders';
import type { ThresholdConfig, Tone } from '../lib/orders';
import type { Order } from '../types';

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

const TONE_CLASSES: Record<Tone, string> = {
  normal: 'bg-surface-sunken text-ink-soft',
  warn: 'bg-status-pending-soft text-status-pending',
  late: 'bg-danger-soft text-danger',
};

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
          // Amber here would read the same as a cash ticket, which is exactly
          // the mix-up that gets an unpaid drink made. Red, and the word
          // "Unpaid" rather than the payment method.
          Icon: QrCode,
          label: 'Unpaid',
          classes: 'bg-danger-soft text-danger',
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
      className={`inline-flex items-center gap-2 rounded-none px-3 py-1.5 text-base font-bold ${classes}`}
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
  thresholds,
}: {
  order: Order;
  now: number;
  thresholds?: Partial<ThresholdConfig> | null;
}) {
  const { label, stale } = formatElapsed(order.createdAt, now);
  // An unpaid order is not "late for the kitchen" — nothing is owed until the
  // money lands. Leaving it on the pending 5/10-minute clock would paint it red
  // for the wrong reason and dilute the red that means "do not make this".
  const tone = isAwaitingPayment(order)
    ? 'normal'
    : elapsedTone(order.status, order.createdAt, now, thresholds);
  const spoken = stale
    ? `Placed ${label}, earlier shift`
    : tone === 'late'
      ? `${label} waiting — over target`
      : tone === 'warn'
        ? `${label} waiting — approaching target`
        : `${label} waiting`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-none px-2.5 py-1 text-sm font-semibold tabular-nums ${TONE_CLASSES[tone]}`}
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

/**
 * The unmissable part. A solid --danger band the full width of the card, so an
 * unpaid ticket is a different colour of object from across the counter, not a
 * card with a small grey label on it.
 *
 * It owns a one-second tick of its own: the board clock runs at 15s (elapsed
 * labels are minute-resolution) and an mm:ss countdown that jumps in 15s steps
 * looks broken. Keeping the interval here means only this strip re-renders.
 */
function AwaitingPaymentBanner({ order }: { order: Order }) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiresAt = paymentExpiryAt(order);
  const remaining = expiresAt == null ? null : expiresAt - tick;
  const expired = remaining != null && remaining <= 0;

  // No expiry means the QR was never issued, so there is no clock to show —
  // but the order is every bit as unpaid.
  const timer =
    remaining == null
      ? 'No QR issued'
      : expired
        ? `Expired ${formatCountdown(-remaining)} ago`
        : `${formatCountdown(remaining)} left`;

  /*
   * Both states are the same solid red, because the instruction is the same:
   * do not make it. The difference is carried by the icon and the words, not a
   * second red — --danger-strong is darker than --danger in the light theme and
   * lighter in the dark one, so a shade swap would mean opposite things
   * depending on which theme the tablet is in.
   */
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-danger px-4 py-2 text-on-danger">
      <span className="inline-flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
        {expired ? (
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Hourglass className="size-4 shrink-0" aria-hidden="true" />
        )}
        {expired ? 'Payment expired' : 'Waiting for payment'}
      </span>
      <span className="text-sm font-bold tabular-nums">{timer}</span>
      <span className="sr-only">
        {expired
          ? 'The QR code for this order has expired and it was never paid. Do not make it.'
          : 'This order has not been paid. Do not start making it.'}
      </span>
    </div>
  );
}

/**
 * Two-tap confirm. A modal for this would block the whole board mid-rush, and
 * the second tap expires on its own so a stray press never arms a button that
 * somebody else walks up and hits.
 */
function useTapConfirm(onConfirm: () => void, timeoutMs = 4000) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const press = useCallback(() => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), timeoutMs);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  }, [armed, onConfirm, timeoutMs]);

  return { armed, press };
}

export interface OrderCardProps {
  order: Order;
  now: number;
  updating: boolean;
  isNew: boolean;
  /** True while the board shows more than one branch, so each card must name its own. */
  showBranch: boolean;
  thresholds?: Partial<ThresholdConfig> | null;
  onAction: (id: string, status: string) => void;
  onCancel: (order: Order) => void;
  /** Escape hatch: the customer paid at the counter instead of scanning. */
  onMarkPaid: (id: string) => void;
  onSeen: (id: string) => void;
}

function OrderCardImpl({
  order,
  now,
  updating,
  isNew,
  showBranch,
  thresholds,
  onAction,
  onCancel,
  onMarkPaid,
  onSeen,
}: OrderCardProps) {
  const awaitingPayment = isAwaitingPayment(order);
  // No "Start preparing" while nobody has paid — see the footer below.
  const config = awaitingPayment ? undefined : STATUS_CONFIG[order.status];
  const currentTone = awaitingPayment
    ? 'normal'
    : elapsedTone(order.status, order.createdAt, now, thresholds);

  const paidConfirm = useTapConfirm(
    useCallback(() => onMarkPaid(order.id), [onMarkPaid, order.id]),
  );

  const cancellable = order.status === 'pending' || order.status === 'paid';

  return (
    <Card
      padding="none"
      // The "new" ring stays until a human touches the card. A 4-second timer
      // expires while nobody is looking at the tablet, which is exactly when a
      // new order is most likely to be missed.
      // shrink-0: the lane is a flex column that scrolls, and without this the
      // cards compress to fit instead of overflowing.
      // The unpaid ring outranks the new-order ring: "do not make this" matters
      // more than "you have not looked at this yet".
      className={`shrink-0 overflow-hidden transition-all ${
        awaitingPayment
          ? 'border-danger ring-2 ring-danger'
          : currentTone === 'late'
            ? 'border-danger ring-2 ring-danger/80 shadow-md shadow-danger/10 motion-safe:animate-pulse'
            : currentTone === 'warn'
              ? 'border-status-pending ring-1 ring-status-pending/60'
              : isNew
                ? 'border-accent ring-2 ring-accent'
                : ''
      }`}
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
        <div className="flex items-center gap-2">
          {cancellable ? (
            <button
              type="button"
              onClick={() => onCancel(order)}
              className="rounded-none px-2 py-1 text-xs font-bold text-danger/70 hover:bg-danger-soft hover:text-danger transition-colors"
              aria-label={`Cancel order ${order.pickupCode ?? ''}`}
            >
              Cancel
            </button>
          ) : null}
          <ElapsedTag order={order} now={now} thresholds={thresholds} />
        </div>
      </div>

      {awaitingPayment ? <AwaitingPaymentBanner order={order} /> : null}

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <PaymentTag order={order} />
        {order.orderType === 'delivery' ? (
          <span className="inline-flex items-center gap-1.5 rounded-none bg-status-preparing-soft px-3 py-1.5 text-sm font-semibold text-status-preparing">
            <Truck className="size-4 shrink-0" aria-hidden="true" />
            Delivery
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-none bg-surface-sunken px-3 py-1.5 text-sm font-semibold text-ink-soft">
            <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
            Pickup
          </span>
        )}
      </div>

      {(order.contactName || order.contactPhone || order.deliveryBuilding || order.deliveryRoom || order.deliveryAddress) ? (
        <div className="mx-4 mt-3 rounded-none border border-border/60 bg-surface-sunken/70 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
              {order.orderType === 'delivery' ? (
                <>
                  <MapPin className="size-3.5 text-status-preparing" aria-hidden="true" />
                  Delivery Destination
                </>
              ) : (
                <>
                  <User className="size-3.5 text-accent" aria-hidden="true" />
                  Customer Details
                </>
              )}
            </p>
            {order.deliveryBuilding && order.deliveryRoom ? (
              <span className="inline-flex items-center gap-1 rounded-none bg-surface px-2 py-0.5 text-xs font-black text-ink shadow-xs">
                <Building2 className="size-3 text-ink-soft" />
                Bldg {order.deliveryBuilding} · Rm {order.deliveryRoom}
              </span>
            ) : null}
          </div>

          {order.deliveryAddress && order.orderType === 'delivery' ? (
            <p className="text-xs text-ink-soft">{order.deliveryAddress}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 border-t border-border/40 text-xs">
            {order.contactName ? (
              <div className="flex items-center gap-1.5 font-bold text-ink">
                <User className="size-3.5 text-ink-faint shrink-0" />
                <span>{order.contactName}</span>
              </div>
            ) : (
              <span className="text-ink-faint italic">Customer</span>
            )}

            {order.contactPhone ? (
              <a
                href={`tel:${order.contactPhone}`}
                className="inline-flex items-center gap-1.5 rounded-none bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent hover:text-on-accent transition-colors"
                title={`Call ${order.contactPhone}`}
              >
                <Phone className="size-3.5 shrink-0" />
                <span>{order.contactPhone}</span>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2.5 px-4">
        {order.items.map((item) => {
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
                className="mt-2 size-2.5 shrink-0 rounded-none bg-accent"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base leading-snug font-semibold text-ink">
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

      <div className="mt-4 border-t border-border p-3">
        {awaitingPayment ? (
          /*
           * The escape hatch. A customer whose QR failed often just pays cash at
           * the counter, and that order still has to be made — so the path
           * cannot be removed, only made deliberate. It is `secondary`, not the
           * green primary, so the thumb that reaches for "Start preparing" does
           * not land on it, and it takes a second tap to fire. Marking the order
           * `paid` (rather than jumping straight to preparing) keeps the money
           * on the record and drops the ticket back into the normal
           * pending -> preparing -> ready -> completed run.
           */
          <Button
            variant={paidConfirm.armed ? 'success' : 'secondary'}
            size="md"
            fullWidth
            loading={updating}
            onClick={paidConfirm.press}
            aria-label={
              paidConfirm.armed
                ? `Confirm that order ${order.pickupCode ?? ''} was paid at the counter`
                : `Mark order ${order.pickupCode ?? ''} as paid at the counter`
            }
          >
            {paidConfirm.armed ? 'Tap to confirm payment' : 'Paid at counter'}
          </Button>
        ) : config ? (
          <Button
            variant={config.button}
            size="md"
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
