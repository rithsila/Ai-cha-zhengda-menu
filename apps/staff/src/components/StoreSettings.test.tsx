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
import { StoreSettings } from './StoreSettings';
import { ToastProvider } from './ui/Toast';

const mockStoreStatus = {
  isOpen: true,
  storeStatus: 'auto',
  openTime: '08:00',
  closeTime: '21:00',
  enablePickup: true,
  enableDelivery: true,
  enableCash: true,
  enableKhqr: true,
  currentTime: '10:00',
  reason: 'schedule_open',
  menuBannerUrl: '/banner.webp',
  menuTabsConfig: JSON.stringify([
    { id: 'ai-cha', label: 'Ai-Cha', icon: '/images/aicha-logo.webp', enabled: true },
    { id: 'zhengda', label: 'Zhengda', icon: '/images/zhengda_logo_cropped.webp', enabled: true },
    { id: 'tab3', label: 'Specials', icon: '', enabled: false },
  ]),
  shopName: 'Our shop',
  shopAddress: 'J03, Ground Floor, Arakawa',
  shopDeliveryNote: 'Delivery inside Arakawa is free',
  shopSocialsEnabled: true,
  shopSocialLinks: JSON.stringify([
    { id: 'telegram', label: 'Telegram', url: 'https://t.me/test', enabled: true },
  ]),
};

const mockConfigRows = [
  { key: 'deliveryFee', value: '0' },
  { key: 'openTime', value: '08:00' },
  { key: 'closeTime', value: '21:00' },
  { key: 'orderWarnPendingMins', value: '5' },
  { key: 'orderLatePendingMins', value: '10' },
];

describe('StoreSettings strict layer', () => {
  let putRequests: Array<{ key: string; value: string }> = [];

  beforeEach(() => {
    putRequests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method || 'GET';

        if (urlStr.includes('/api/store/status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockStoreStatus,
          });
        }

        if (urlStr.includes('/api/config') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockConfigRows,
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

  it('renders Cancel and Save buttons (disabled when clean), without Refresh button', async () => {
    render(
      <ToastProvider>
        <StoreSettings />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Operating Mode & Hours')).toBeDefined();
    });

    // Refresh button should be gone
    expect(screen.queryByRole('button', { name: /Refresh/i })).toBeNull();

    // Cancel and Save buttons are present and disabled initially
    const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i }) as HTMLButtonElement;
    const saveBtn = screen.getByRole('button', { name: /^Save$/i }) as HTMLButtonElement;
    expect(cancelBtn).toBeDefined();
    expect(saveBtn).toBeDefined();
    expect(cancelBtn.disabled).toBe(true);
    expect(saveBtn.disabled).toBe(true);
    expect(screen.queryByText(/UNSAVED DRAFT/i)).toBeNull();
  });

  it('entering changes enables Cancel and Save, and does NOT call PUT immediately', async () => {
    render(
      <ToastProvider>
        <StoreSettings />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Operating Mode & Hours')).toBeDefined();
    });

    const openTimeInput = screen.getByDisplayValue('08:00');
    fireEvent.change(openTimeInput, { target: { value: '09:30' } });

    // Should show dirty badge and enabled Cancel/Save buttons
    expect(screen.getByText(/UNSAVED DRAFT/i)).toBeDefined();
    const cancelButtons = screen.getAllByRole('button', { name: /^Cancel$/i }) as HTMLButtonElement[];
    const saveButtons = screen.getAllByRole('button', { name: /^Save$/i }) as HTMLButtonElement[];
    expect(cancelButtons[0].disabled).toBe(false);
    expect(saveButtons[0].disabled).toBe(false);

    // No PUT request sent yet!
    expect(putRequests.length).toBe(0);
  });

  it('clicking Cancel reverts input back to saved state and disables buttons', async () => {
    render(
      <ToastProvider>
        <StoreSettings />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Operating Mode & Hours')).toBeDefined();
    });

    const openTimeInput = screen.getByDisplayValue('08:00');
    fireEvent.change(openTimeInput, { target: { value: '09:30' } });
    expect(screen.getByDisplayValue('09:30')).toBeDefined();

    const cancelButtons = screen.getAllByRole('button', { name: /^Cancel$/i });
    fireEvent.click(cancelButtons[0]);

    // Reverts back to 08:00
    expect(screen.getByDisplayValue('08:00')).toBeDefined();
    expect(screen.queryByText(/UNSAVED DRAFT/i)).toBeNull();

    const topCancel = screen.getByRole('button', { name: /^Cancel$/i }) as HTMLButtonElement;
    expect(topCancel.disabled).toBe(true);
  });

  it('clicking Save opens confirmation modal with immediate customer impact warning', async () => {
    render(
      <ToastProvider>
        <StoreSettings />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Operating Mode & Hours')).toBeDefined();
    });

    const openTimeInput = screen.getByDisplayValue('08:00');
    fireEvent.change(openTimeInput, { target: { value: '09:30' } });

    const saveButtons = screen.getAllByRole('button', { name: /^Save$/i });
    fireEvent.click(saveButtons[0]);

    // Confirmation modal should appear
    expect(screen.getByText('Apply Changes to Live Menu?')).toBeDefined();
    expect(screen.getByText('Immediate Customer Impact')).toBeDefined();
    expect(screen.getByText('Review Modified Settings (1)')).toBeDefined();
    expect(screen.getByText('Confirm & Apply to Menu')).toBeDefined();

    // Still no PUT requests sent before confirmation
    expect(putRequests.length).toBe(0);
  });

  it('confirming in modal executes PUT /api/config and clears dirty state', async () => {
    render(
      <ToastProvider>
        <StoreSettings />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Operating Mode & Hours')).toBeDefined();
    });

    const openTimeInput = screen.getByDisplayValue('08:00');
    fireEvent.change(openTimeInput, { target: { value: '09:30' } });

    const saveButtons = screen.getAllByRole('button', { name: /^Save$/i });
    fireEvent.click(saveButtons[0]);

    const confirmBtn = screen.getByRole('button', { name: /Confirm & Apply to Menu/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(putRequests).toEqual([
        { key: 'openTime', value: '09:30' },
      ]);
    });

    await waitFor(() => {
      expect(screen.queryByText('Apply Changes to Live Menu?')).toBeNull();
      expect(screen.queryByText(/UNSAVED DRAFT/i)).toBeNull();
    });
  });
});
