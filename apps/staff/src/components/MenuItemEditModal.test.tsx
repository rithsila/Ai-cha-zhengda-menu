import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuItemEditModal, type MenuItemFull } from './MenuItemEditModal';
import { ToastProvider } from './ui/Toast';

const mockAiChaCategories = [
  { id: 'c1', brand: 'ai-cha', name: 'Milk Tea', sortOrder: 0, isActive: true },
  { id: 'c2', brand: 'ai-cha', name: 'Fruit Tea', sortOrder: 1, isActive: true },
  { id: 'c3', brand: 'ai-cha', name: 'Smoothies', sortOrder: 2, isActive: true },
];

const mockZhengdaCategories = [
  { id: 'c4', brand: 'zhengda', name: 'Fried Chicken', sortOrder: 0, isActive: true },
  { id: 'c5', brand: 'zhengda', name: 'Snacks', sortOrder: 1, isActive: true },
];

describe('MenuItemEditModal Category Dropdown & Quick Add', () => {
  beforeEach(() => {
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
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';

      // GET /api/categories?brand=
      if (urlStr.includes('/api/categories') && method === 'GET') {
        if (urlStr.includes('brand=zhengda')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockZhengdaCategories,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockAiChaCategories,
        });
      }

      // POST /api/categories
      if (urlStr.endsWith('/api/categories') && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'c-new',
            brand: body.brand,
            name: body.name,
            sortOrder: 10,
            isActive: true,
          }),
        });
      }

      // POST /api/catalog
      if (urlStr.endsWith('/api/catalog') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ id: 'new-item-id' }),
        });
      }

      // PUT /api/catalog/:id
      if (urlStr.includes('/api/catalog/') && method === 'PUT') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: 'updated-item-id' }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    }));
  });

  it('loads categories based on selected brand (ai-cha default)', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={null} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>
    );

    await waitFor(() => {
      const combobox = screen.getByRole('combobox', { name: /category/i });
      expect(combobox.textContent).toContain('Milk Tea');
    });

    const combobox = screen.getByRole('combobox', { name: /category/i });
    await user.click(combobox);

    expect(screen.getByRole('option', { name: 'Milk Tea' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Fruit Tea' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Smoothies' })).toBeDefined();
  });

  it('allows category to be selected from the dropdown', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={null} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i })).toBeDefined();
    });

    const combobox = screen.getByRole('combobox', { name: /category/i });
    await user.click(combobox);

    const fruitTeaOption = screen.getByRole('option', { name: 'Fruit Tea' });
    await user.click(fruitTeaOption);

    expect(combobox.textContent).toContain('Fruit Tea');
  });

  it('loads categories for new brand and adjusts default category when switching brand toggle', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={null} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i }).textContent).toContain('Milk Tea');
    });

    // Switch brand to Zhengda
    const zhengdaRadio = screen.getByRole('radio', { name: /zhengda/i });
    await user.click(zhengdaRadio);

    // Should load Zhengda categories and select first category
    await waitFor(() => {
      const combobox = screen.getByRole('combobox', { name: /category/i });
      expect(combobox.textContent).toContain('Fried Chicken');
    });

    // Verify options in Zhengda
    const combobox = screen.getByRole('combobox', { name: /category/i });
    await user.click(combobox);
    expect(screen.getByRole('option', { name: 'Fried Chicken' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Snacks' })).toBeDefined();
  });

  it('preserves existing item category, including custom categories', async () => {
    const existingItem: MenuItemFull = {
      id: 'item-1',
      brand: 'ai-cha',
      name: 'Signature Taro',
      category: 'Special Seasonal',
      basePrice: 3.5,
    };

    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={existingItem} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>
    );

    await waitFor(() => {
      const combobox = screen.getByRole('combobox', { name: /category/i });
      expect(combobox.textContent).toContain('Special Seasonal');
    });
  });

  it('restores original item category when switching back to item brand', async () => {
    const user = userEvent.setup();
    const existingItem: MenuItemFull = {
      id: 'item-2',
      brand: 'ai-cha',
      name: 'Oolong Special',
      category: 'Fruit Tea',
      basePrice: 3.0,
    };

    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={existingItem} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i }).textContent).toContain('Fruit Tea');
    });

    // Switch to Zhengda
    await user.click(screen.getByRole('radio', { name: /zhengda/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i }).textContent).toContain('Fried Chicken');
    });

    // Switch back to Ai-Cha -> restores original Fruit Tea category
    await user.click(screen.getByRole('radio', { name: /ai-cha/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i }).textContent).toContain('Fruit Tea');
    });
  });

  it('quick-add creates a new category with POST /api/categories and selects it immediately', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={null} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^new$/i })).toBeDefined();
    });

    // Click "New"
    await user.click(screen.getByRole('button', { name: /^new$/i }));

    // Inline input should appear with Save and Cancel
    const input = screen.getByPlaceholderText(/new category name/i);
    const container = input.closest('div')!;
    expect(input).toBeDefined();
    expect(within(container).getByRole('button', { name: /^save$/i })).toBeDefined();
    expect(within(container).getByRole('button', { name: /^cancel$/i })).toBeDefined();

    // Type new category name and save
    await user.type(input, 'Sparkling Soda');
    await user.click(within(container).getByRole('button', { name: /^save$/i }));

    // Selected category should now be Sparkling Soda
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i }).textContent).toContain('Sparkling Soda');
    });

    // Inline input should be closed
    expect(screen.queryByPlaceholderText(/new category name/i)).toBeNull();
  });

  it('allows cancelling quick-add without changing selected category', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={null} onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i }).textContent).toContain('Milk Tea');
    });

    await user.click(screen.getByRole('button', { name: /^new$/i }));
    const input = screen.getByPlaceholderText(/new category name/i);
    const container = input.closest('div')!;
    await user.type(input, 'Unsaved Category');

    await user.click(within(container).getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByPlaceholderText(/new category name/i)).toBeNull();
    expect(screen.getByRole('combobox', { name: /category/i }).textContent).toContain('Milk Tea');
  });

  it('submits form with selected category and payload', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <ToastProvider>
        <MenuItemEditModal isOpen={true} item={null} onClose={onClose} onSaved={onSaved} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /category/i })).toBeDefined();
    });

    // Select Fruit Tea
    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(screen.getByRole('option', { name: 'Fruit Tea' }));

    // Type Item Name
    const nameInput = screen.getByPlaceholderText(/e\.g\. Brown Sugar Boba Milk/i);
    await user.type(nameInput, 'Mango Green Tea');

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Create Menu Item/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    // Verify catalog payload included category: Fruit Tea
    const fetchMock = globalThis.fetch as any;
    const catalogCall = fetchMock.mock.calls.find((call: any[]) =>
      String(call[0]).endsWith('/api/catalog') && call[1]?.method === 'POST'
    );
    expect(catalogCall).toBeDefined();
    const body = JSON.parse(catalogCall[1].body);
    expect(body.category).toBe('Fruit Tea');
    expect(body.name).toBe('Mango Green Tea');
  });
});
