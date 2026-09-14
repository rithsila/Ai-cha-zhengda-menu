import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendOrderNotification,
} from './notification';
import type { Order } from '../types';

describe('notification utility', () => {
  let notificationMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notificationMock = vi.fn();
    (notificationMock as any).permission = 'default';
    (notificationMock as any).requestPermission = vi.fn().mockResolvedValue('granted');

    Object.defineProperty(window, 'Notification', {
      writable: true,
      configurable: true,
      value: notificationMock,
    });
  });

  it('detects notification support and permissions', () => {
    expect(isNotificationSupported()).toBe(true);
    expect(getNotificationPermission()).toBe('default');
  });

  it('requests notification permission from user', async () => {
    const result = await requestNotificationPermission();
    expect(result).toBe('granted');
    expect(Notification.requestPermission).toHaveBeenCalled();
  });

  it('does not send notification when permission is not granted', () => {
    (Notification as any).permission = 'denied';
    const mockOrders: Order[] = [
      {
        id: 'ord-1',
        pickupCode: 'A101',
        status: 'paid',
        totalAmount: 2.5,
        paymentMethod: 'cash',
        orderType: 'dine_in',
        paymentExpiresAt: null,
        deliveryAddress: null,
        deliveryBuilding: null,
        deliveryRoom: null,
        contactName: null,
        contactPhone: null,
        deliveryLat: null,
        deliveryLng: null,
        items: [
          {
            id: 'i1',
            quantity: 1,
            price: 2.5,
            modifiers: '[]',
            menuItem: { name: 'Original Milk Tea', brand: 'ai-cha' },
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ];

    sendOrderNotification(mockOrders);
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it('sends notification when permission is granted and orders exist', () => {
    (Notification as any).permission = 'granted';
    const mockOrders: Order[] = [
      {
        id: 'ord-1',
        pickupCode: 'A101',
        status: 'paid',
        totalAmount: 2.5,
        paymentMethod: 'cash',
        orderType: 'dine_in',
        paymentExpiresAt: null,
        deliveryAddress: null,
        deliveryBuilding: null,
        deliveryRoom: null,
        contactName: null,
        contactPhone: null,
        deliveryLat: null,
        deliveryLng: null,
        items: [
          {
            id: 'i1',
            quantity: 1,
            price: 2.5,
            modifiers: '[]',
            menuItem: { name: 'Original Milk Tea', brand: 'ai-cha' },
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ];

    sendOrderNotification(mockOrders);
    expect(notificationMock).toHaveBeenCalledWith(
      '🔔 New Order: A101',
      expect.objectContaining({
        body: expect.stringContaining('Original Milk Tea'),
        icon: '/images/zhengda_logo_cropped.webp',
      })
    );
  });
});
