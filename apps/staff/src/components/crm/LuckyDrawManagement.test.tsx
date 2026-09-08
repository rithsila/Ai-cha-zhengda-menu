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
import { LuckyDrawManagement } from './LuckyDrawManagement';
import { ToastProvider } from '../ui/Toast';

const mockConfigs = [
  { key: 'luckyDrawEnabled', value: '1' },
  { key: 'goldMinOrdersThreshold', value: '3' },
  { key: 'luckyTicketsPerGoldOrder', value: '2' },
  { key: 'luckyTicketsPerStandardOrder', value: '1' },
  { key: 'luckyTicketsCostPerSpin', value: '5' },
];

describe('LuckyDrawManagement', () => {
  let putRequests: Array<{ key: string; value: string }> = [];

  beforeEach(() => {
    putRequests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method || 'GET';

        if (urlStr.includes('/api/config') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockConfigs,
          });
        }

        if (urlStr.includes('/api/customers')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              customers: [],
              total: 0,
              summary: { totalLuckyTickets: 15 },
            }),
          });
        }

        if (urlStr.includes('/api/lucky-draw/claims')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [],
          });
        }

        if (urlStr.includes('/api/config') && method === 'PUT') {
          const body = JSON.parse(String(init?.body || '{}'));
          putRequests.push(body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: body.key, value: body.value }),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        });
      })
    );
  });

  it('renders Lucky Draw & Ticket Rules card and updates settings', async () => {
    render(
      <ToastProvider>
        <LuckyDrawManagement />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Lucky Draw & Ticket Rules')).toBeDefined();
    });

    // Check feature switch
    const luckySwitch = screen.getByRole('switch', { name: /Enable lucky draw feature/i });
    expect(luckySwitch.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(luckySwitch);

    await waitFor(() => {
      expect(putRequests).toContainEqual({ key: 'luckyDrawEnabled', value: '0' });
    });

    // Update gold threshold
    const goldThresholdInput = screen.getByLabelText(/Orders for Gold VIP Promotion/i);
    fireEvent.change(goldThresholdInput, { target: { value: '10' } });
    fireEvent.blur(goldThresholdInput);

    await waitFor(() => {
      expect(putRequests).toContainEqual({ key: 'goldMinOrdersThreshold', value: '10' });
    });

    // Update gold tickets per order
    const goldTicketsInput = screen.getByLabelText(/Tickets per Gold VIP Order/i);
    fireEvent.change(goldTicketsInput, { target: { value: '4' } });
    fireEvent.blur(goldTicketsInput);

    await waitFor(() => {
      expect(putRequests).toContainEqual({ key: 'luckyTicketsPerGoldOrder', value: '4' });
    });

    // Update standard tickets per order
    const stdTicketsInput = screen.getByLabelText(/Tickets per Standard Order/i);
    fireEvent.change(stdTicketsInput, { target: { value: '2' } });
    fireEvent.blur(stdTicketsInput);

    await waitFor(() => {
      expect(putRequests).toContainEqual({ key: 'luckyTicketsPerStandardOrder', value: '2' });
    });

    // Update spin cost
    const spinCostInput = screen.getByLabelText(/Ticket Cost Per Lucky Spin/i);
    fireEvent.change(spinCostInput, { target: { value: '8' } });
    fireEvent.blur(spinCostInput);

    await waitFor(() => {
      expect(putRequests).toContainEqual({ key: 'luckyTicketsCostPerSpin', value: '8' });
    });
  });
});
