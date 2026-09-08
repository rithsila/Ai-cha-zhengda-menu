import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageManagement } from './LanguageManagement';
import { ToastProvider } from '../ui';
import * as apiModule from '../../lib/api';

const mockTranslationsResponse = {
  page: 1,
  limit: 10,
  total: 2,
  items: [
    {
      id: 'trans-1',
      ownerType: 'menu_item',
      ownerKey: 'item-pearl-milk-tea',
      field: 'name',
      sourceLocale: 'zh',
      revision: 1,
      sourceRevision: 1,
      cells: [
        { locale: 'zh', text: '珍珠奶茶', status: 'reviewed' },
        { locale: 'en', text: 'Pearl Milk Tea', status: 'reviewed' },
        { locale: 'km', text: 'តែគុជ', status: 'reviewed' },
      ],
    },
    {
      id: 'trans-2',
      ownerType: 'category',
      ownerKey: 'Fruit Tea',
      field: 'name',
      sourceLocale: 'en',
      revision: 2,
      sourceRevision: 2,
      cells: [
        { locale: 'en', text: 'Fruit Tea', status: 'reviewed' },
        { locale: 'km', text: 'តែផ្លែឈើ', status: 'reviewed' },
        { locale: 'zh', text: '', status: 'draft' },
      ],
    },
  ],
};

describe('LanguageManagement (Task 6)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiModule, 'loadSession').mockReturnValue({
      token: 'test-token',
      role: 'manager',
      expiresAt: Date.now() + 3600000,
    });

    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';

      if (urlStr.includes('/api/translations') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTranslationsResponse,
        });
      }

      if (urlStr.includes('/api/translations') && method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ count: 1 }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderComponent = () => {
    return render(
      <ToastProvider>
        <LanguageManagement />
      </ToastProvider>
    );
  };

  it('renders three-column translation table with language values and metadata', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('item-pearl-milk-tea')).toBeDefined();
    });

    // Check columns
    expect(screen.getByRole('columnheader', { name: 'English' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Khmer' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Chinese' })).toBeDefined();

    // Check cells
    const zhInput = screen.getByRole('textbox', {
      name: 'Chinese item-pearl-milk-tea name',
    }) as HTMLInputElement;
    const enInput = screen.getByRole('textbox', {
      name: 'English item-pearl-milk-tea name',
    }) as HTMLInputElement;
    const kmInput = screen.getByRole('textbox', {
      name: 'Khmer item-pearl-milk-tea name',
    }) as HTMLInputElement;

    expect(zhInput.value).toBe('珍珠奶茶');
    expect(enInput.value).toBe('Pearl Milk Tea');
    expect(kmInput.value).toBe('តែគុជ');
  });

  it('tracks local edits, displays unsaved changes banner, and saves via PATCH with revision', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('item-pearl-milk-tea')).toBeDefined();
    });

    // No unsaved banner initially
    expect(screen.queryByText(/You have/i)).toBeNull();

    // Edit English cell
    const enInput = screen.getByRole('textbox', {
      name: 'English item-pearl-milk-tea name',
    });
    fireEvent.change(enInput, { target: { value: 'Super Pearl Milk Tea' } });

    // Unsaved banner must appear
    await waitFor(() => {
      expect(screen.getByText(/You have/i)).toBeDefined();
    });

    // Click Save Changes
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      const fetchMock = globalThis.fetch as any;
      const patchCall = fetchMock.mock.calls.find(
        (call: any[]) =>
          String(call[0]).includes('/api/translations') && call[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall[1].body);
      expect(body.edits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'trans-1',
            expectedRevision: 1,
            cells: expect.arrayContaining([
              expect.objectContaining({ locale: 'en', text: 'Super Pearl Milk Tea' }),
            ]),
          }),
        ])
      );
    });
  });

  it('filters by content type and search query', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('item-pearl-milk-tea')).toBeDefined();
    });

    // Filter by Categories via CustomSelect
    const typeSelect = screen.getByRole('combobox', { name: /Filter content type/i });
    await user.click(typeSelect);
    const categoryOption = screen.getByRole('option', { name: 'Categories' });
    await user.click(categoryOption);

    await waitFor(() => {
      const fetchMock = globalThis.fetch as any;
      const filterCall = fetchMock.mock.calls.find((call: any[]) =>
        String(call[0]).includes('ownerType=category')
      );
      expect(filterCall).toBeDefined();
    });
  });

  it('handles HTTP 409 concurrency conflict with dialog and server comparison', async () => {
    const user = userEvent.setup();
    const fakeFetch = vi.fn((url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';

      if (urlStr.includes('/api/translations') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTranslationsResponse,
        });
      }

      if (urlStr.includes('/api/translations') && method === 'PATCH') {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({
            error: 'Conflict: Expected revision 1 but server is at 2',
            serverRecords: [
              {
                id: 'trans-1',
                revision: 2,
                cells: [{ locale: 'en', text: 'Server Updated Pearl Milk Tea' }],
              },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fakeFetch);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('item-pearl-milk-tea')).toBeDefined();
    });

    const enInput = screen.getByRole('textbox', {
      name: 'English item-pearl-milk-tea name',
    });
    fireEvent.change(enInput, { target: { value: 'My Local Edit' } });

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    await user.click(saveBtn);

    // Conflict modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Translation Conflict \(HTTP 409\)/i)).toBeDefined();
      expect(screen.getByText(/Use Server Version/i)).toBeDefined();
      expect(screen.getByText(/Keep My Changes & Retry/i)).toBeDefined();
    });
  });

  it('opens customer menu preview modal reflecting draft changes', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('item-pearl-milk-tea')).toBeDefined();
    });

    // Preview button on first item
    const previewBtn = screen.getByRole('button', {
      name: /Preview item-pearl-milk-tea/i,
    });
    await user.click(previewBtn);

    // Preview modal should open
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Menu customer language preview/i })).toBeDefined();
      expect(screen.getByText('Customer Menu Preview')).toBeDefined();
    });

    // Language switcher buttons in preview
    expect(screen.getByRole('button', { name: 'English' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'ខ្មែរ (Khmer)' })).toBeDefined();
    expect(screen.getByRole('button', { name: '中文 (Chinese)' })).toBeDefined();
  });

  it('restricts access when user role is ordinary staff', () => {
    vi.spyOn(apiModule, 'loadSession').mockReturnValue({
      token: 'test-token',
      role: 'staff',
      expiresAt: Date.now() + 3600000,
    });

    renderComponent();

    expect(screen.getByText('Manager Access Required')).toBeDefined();
    expect(
      screen.getByText(/Translation and multilingual menu management is restricted to manager accounts/i)
    ).toBeDefined();
  });

  it('safely renders items when sourceLocale is null without crashing', async () => {
    vi.spyOn(window, 'fetch').mockImplementation((url: any) => {
      if (String(url).includes('/api/translations')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              page: 1,
              limit: 10,
              total: 1,
              items: [
                {
                  id: 'trans-null-locale',
                  ownerType: 'category',
                  ownerKey: 'cat-ice-cream',
                  field: 'name',
                  sourceLocale: null,
                  revision: 1,
                  sourceRevision: 1,
                  cells: [
                    { locale: 'en', text: 'Ice Cream', status: 'reviewed' },
                    { locale: 'km', text: 'ការ៉េម', status: 'reviewed' },
                    { locale: 'zh', text: '冰淇淋', status: 'reviewed' },
                  ],
                },
              ],
            }),
        } as any);
      }
      return Promise.reject(new Error('Unknown url'));
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('cat-ice-cream')).toBeDefined();
      expect(screen.getByText('Orig: AUTO')).toBeDefined();
    });
  });
});
