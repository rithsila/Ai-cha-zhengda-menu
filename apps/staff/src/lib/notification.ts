/*
 * Browser System Notification utility for Staff tablet.
 * Sends native system notifications for new orders even if the staff is on another tab or app.
 */

import type { Order } from '../types';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
}

export function sendOrderNotification(orders: Order[]): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  if (!orders || orders.length === 0) return;

  const count = orders.length;
  const codes = orders.map((o) => o.pickupCode || `#${o.id.slice(-4)}`).join(', ');
  const title = count === 1 ? `🔔 New Order: ${codes}` : `🔔 ${count} New Orders: ${codes}`;

  const summary = orders
    .map((o) => {
      const itemsText =
        o.items?.map((i) => `${i.quantity}x ${i.menuItem?.name || 'Item'}`).join(', ') || '';
      return `${o.pickupCode || 'Order'}: ${itemsText}`;
    })
    .slice(0, 3)
    .join('\n');

  try {
    const notification = new Notification(title, {
      body: summary || 'A new order has arrived and needs preparation.',
      icon: '/images/zhengda_logo_cropped.webp',
      badge: '/favicon.png',
      tag: 'staff-order-alert',
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (err) {
    console.warn('Unable to display browser notification:', err);
  }
}
