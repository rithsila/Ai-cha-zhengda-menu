import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogView } from './AuditLogView';
import { ToastProvider } from './ui/Toast';
import { saveSession } from '../lib/api';

const mockLogs = [
  {
    id: 'log-1',
    actorType: 'manager',
    actorId: 'mgr-1',
    actorName: 'Admin Alice',
    action: 'ITEM_PRICE_UPDATE',
    entityType: 'menu_item',
    entityId: 'item-100',
    oldValue: JSON.stringify({ basePrice: 2.0 }),
    newValue: JSON.stringify({ basePrice: 2.5 }),
    metadata: null,
    createdAt: new Date('2026-09-13T10:00:00Z').toISOString(),
  },
  {
    id: 'log-2',
    actorType: 'system',
    actorId: 'aba-webhook',
    actorName: null,
    action: 'PAYMENT_APPROVED',
    entityType: 'payment',
    entityId: 'ord-aba-999',
    oldValue: null,
    newValue: null,
    metadata: JSON.stringify({ tranId: 'ABA98124', amount: 5.0, pickupCode: '042' }),
    createdAt: new Date('2026-09-13T10:05:00Z').toISOString(),
  },
  {
    id: 'log-3',
    actorType: 'staff',
    actorId: 'staff-1',
    actorName: 'Sophea Staff',
    action: 'ORDER_STATUS_CHANGED',
    entityType: 'order',
    entityId: 'ord-aba-999',
    oldValue: 'pending',
    newValue: 'preparing',
    metadata: null,
    createdAt: new Date('2026-09-13T10:10:00Z').toISOString(),
  },
];

describe('AuditLogView component', () => {
  let fetchedUrls: string[] = [];

  beforeEach(() => {
    fetchedUrls = [];
    localStorage.clear();
    saveSession({
      token: 'mock-staff-token',
      role: 'manager',
      expiresAt: Date.now() + 3600000,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const urlStr = String(url);
        fetchedUrls.push(urlStr);

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            logs: mockLogs,
            total: mockLogs.length,
          }),
        });
      })
    );
  });

  it('renders heading, total count, and loads logs on mount', async () => {
    render(
      <ToastProvider>
        <AuditLogView />
      </ToastProvider>
    );

    expect(screen.getByRole('heading', { name: 'Audit Logs' })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('3 Total Events')).toBeDefined();
    });

    // Check action badges
    expect(screen.getByText('Price Change')).toBeDefined();
    expect(screen.getByText('Payment Approved')).toBeDefined();
    expect(screen.getByText('Status: preparing')).toBeDefined();

    // Check details preview
    expect(screen.getByText('Price: $2.00 → $2.50')).toBeDefined();
    expect(screen.getByText('Tran: ABA98124 | $5.00')).toBeDefined();
    expect(screen.getByText('pending → preparing')).toBeDefined();
  });

  it('opens details inspection modal when clicking View or a row', async () => {
    render(
      <ToastProvider>
        <AuditLogView />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('3 Total Events')).toBeDefined();
    });

    // Click on the View button for the second log (ABA Payment)
    const viewButtons = screen.getAllByRole('button', { name: /view full details for log/i });
    fireEvent.click(viewButtons[1]);

    // Modal opens
    expect(screen.getByRole('heading', { name: 'Audit Log Details' })).toBeDefined();
    expect(screen.getByText('ID: log-2')).toBeDefined();
    expect(screen.getByText('Metadata / Transaction Context')).toBeDefined();

    // Contains tranId inside formatted JSON pre block
    expect(screen.getByText(/"tranId": "ABA98124"/)).toBeDefined();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('ID: log-2')).toBeNull();
    });
  });

  it('searches and triggers API request with search parameter', async () => {
    render(
      <ToastProvider>
        <AuditLogView />
      </ToastProvider>
    );

    const searchInput = screen.getByPlaceholderText(/search order id, aba tran id/i);
    fireEvent.change(searchInput, { target: { value: 'ABA98124' } });

    await waitFor(() => {
      expect(fetchedUrls.some((u) => u.includes('search=ABA98124'))).toBe(true);
    });
  });
});
