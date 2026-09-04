import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryManagementModal } from './CategoryManagementModal';
import { ToastProvider } from './ui/Toast';
import type { MenuItemFull } from './MenuItemEditModal';

const mockItems: MenuItemFull[] = [
  { id: '1', name: 'Brown Sugar Pearl', brand: 'ai-cha', category: 'Milk Tea', basePrice: 2.5 },
  { id: '2', name: 'Classic Milk Tea', brand: 'ai-cha', category: 'Milk Tea', basePrice: 2.0 },
  { id: '3', name: 'Fruit Tea Special', brand: 'ai-cha', category: 'Fruit Tea', basePrice: 3.0 },
  { id: '4', name: 'Crispy Chicken', brand: 'zhengda', category: 'Fried Chicken', basePrice: 4.5 },
];

const mockAiChaCategories = [
  { id: 'c1', brand: 'ai-cha', name: 'Milk Tea', sortOrder: 0, isActive: true },
  { id: 'c2', brand: 'ai-cha', name: 'Fruit Tea', sortOrder: 1, isActive: true },
  { id: 'c3', brand: 'ai-cha', name: 'Smoothies', sortOrder: 2, isActive: true },
];

const mockZhengdaCategories = [
  { id: 'c4', brand: 'zhengda', name: 'Fried Chicken', sortOrder: 0, isActive: true },
];

describe('CategoryManagementModal', () => {
  beforeEach(() => {
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
            sortOrder: 3,
            isActive: true,
          }),
        });
      }

      // PUT /api/categories/reorder
      if (urlStr.endsWith('/api/categories/reorder') && method === 'PUT') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        });
      }

      // PUT /api/categories/:id
      if (urlStr.includes('/api/categories/') && method === 'PUT') {
        const body = JSON.parse(String(init?.body || '{}'));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'c1',
            brand: 'ai-cha',
            name: body.name,
            sortOrder: 0,
            isActive: true,
          }),
        });
      }

      // DELETE /api/categories/:id
      if (urlStr.includes('/api/categories/') && method === 'DELETE') {
        if (urlStr.endsWith('/c1')) {
          // c1 has items, returns 400
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({
              error: 'Cannot delete category: 2 items are assigned to it',
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
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

  const renderModal = (props: Partial<Parameters<typeof CategoryManagementModal>[0]> = {}) => {
    return render(
      <ToastProvider>
        <CategoryManagementModal
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
          {...props}
        />
      </ToastProvider>
    );
  };

  it('renders modal header, close button, brand selector, and categories with item counts', async () => {
    renderModal();

    expect(screen.getByRole('heading', { name: /Manage Categories/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Close/i })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Milk Tea')).toBeDefined();
      expect(screen.getByText('Fruit Tea')).toBeDefined();
      expect(screen.getByText('Smoothies')).toBeDefined();
    });

    // Verify item count badge: Milk Tea has 2 items, Fruit Tea has 1 item, Smoothies has 0 items
    expect(screen.getByText('2 items')).toBeDefined();
    expect(screen.getByText('1 items')).toBeDefined();
    expect(screen.getByText('0 items')).toBeDefined();
  });

  it('switches brand tab and fetches categories for the new brand', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Milk Tea')).toBeDefined();
    });

    const zhengdaTab = screen.getByRole('radio', { name: /Zhengda/i });
    await user.click(zhengdaTab);

    await waitFor(() => {
      expect(screen.getByText('Fried Chicken')).toBeDefined();
    });
  });

  it('adds a new category with POST /api/categories', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Milk Tea')).toBeDefined();
    });

    const input = screen.getByPlaceholderText('New category name...');
    await user.type(input, 'Coffee Series');

    const addBtn = screen.getByRole('button', { name: /^Add$/i });
    await user.click(addBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/categories'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ brand: 'ai-cha', name: 'Coffee Series' }),
        })
      );
    });

    expect((input as HTMLInputElement).value).toBe('');
  });

  it('reorders categories with Up and Down buttons', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Fruit Tea')).toBeDefined();
    });

    // Fruit Tea is at index 1. Click Up to swap with Milk Tea at index 0.
    const moveUpButtons = screen.getAllByRole('button', { name: /Move Up/i });
    // index 0 should be disabled, index 1 should be enabled
    expect(moveUpButtons[0].getAttribute('disabled')).not.toBeNull();
    expect(moveUpButtons[1].getAttribute('disabled')).toBeNull();

    await user.click(moveUpButtons[1]);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/categories/reorder'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            items: [
              { id: 'c2', sortOrder: 0 },
              { id: 'c1', sortOrder: 1 },
              { id: 'c3', sortOrder: 2 },
            ],
          }),
        })
      );
    });
  });

  it('inline renames a category', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Milk Tea')).toBeDefined();
    });

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    await user.click(editButtons[0]);

    // An inline rename input should appear
    const renameInput = screen.getByDisplayValue('Milk Tea');
    await user.clear(renameInput);
    await user.type(renameInput, 'Signature Milk Tea');

    const saveButton = screen.getByRole('button', { name: /Save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/categories/c1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Signature Milk Tea' }),
        })
      );
    });
  });

  it('deletes category with confirmation and shows error if items exist', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Milk Tea')).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
    await user.click(deleteButtons[0]);

    expect(window.confirm).toHaveBeenCalled();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/categories/c1'),
        expect.objectContaining({ method: 'DELETE' })
      );
      // c1 deletion returned 400 error, error toast should display
      expect(screen.getByText(/Cannot delete category: 2 items are assigned to it/i)).toBeDefined();
    });
  });

  it('calls onClose when close button, escape key, or backdrop is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    await waitFor(() => {
      expect(screen.getByText('Milk Tea')).toBeDefined();
    });

    // Close button
    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Backdrop click
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
