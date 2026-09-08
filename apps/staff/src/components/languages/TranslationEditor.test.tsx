import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TranslationEditor } from './TranslationEditor';

describe('TranslationEditor & Drafts (Task 5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders three editable language fields with accessible labels', () => {
    render(
      <TranslationEditor
        label="Item Name"
        fieldName="item name"
        clientKey="item-test"
        field="name"
      />
    );

    expect(screen.getByRole('textbox', { name: 'English item name' })).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Khmer item name' })).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Chinese item name' })).toBeDefined();
  });

  it('detects Chinese source and triggers draft on blur', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'req-1',
        entries: [
          {
            clientKey: 'item-pearl',
            sourceLocale: 'zh',
            needsLanguageConfirmation: false,
            translations: {
              en: 'Pearl milk tea',
              km: 'តែទឹកដោះគោគុជ',
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    render(
      <TranslationEditor
        label="Item Name"
        fieldName="item name"
        clientKey="item-pearl"
        field="name"
      />
    );

    const zhInput = screen.getByRole('textbox', { name: 'Chinese item name' }) as HTMLInputElement;
    fireEvent.change(zhInput, { target: { value: '珍珠奶茶' } });
    fireEvent.blur(zhInput);

    await waitFor(() => {
      expect((screen.getByRole('textbox', { name: 'Chinese item name' }) as HTMLInputElement).value).toBe('珍珠奶茶');
      expect((screen.getByRole('textbox', { name: 'English item name' }) as HTMLInputElement).value).toBe('Pearl milk tea');
      expect((screen.getByRole('textbox', { name: 'Khmer item name' }) as HTMLInputElement).value).toBe('តែទឹកដោះគោគុជ');
    });
  });

  it('allows owner to manually correct target language and protects it from draft overwrite', async () => {
    let draftCallCount = 0;
    const fakeFetch = vi.fn().mockImplementation(async () => {
      draftCallCount += 1;
      return {
        ok: true,
        json: async () => ({
          requestId: `req-${draftCallCount}`,
          entries: [
            {
              clientKey: 'item-manual',
              sourceLocale: 'en',
              translations: {
                zh: '原味奶茶',
                km: 'តែទឹកដោះគោធម្មតា',
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fakeFetch);

    render(
      <TranslationEditor
        label="Item Name"
        fieldName="item name"
        clientKey="item-manual"
        field="name"
      />
    );

    // 1. Enter manual correction in Khmer first
    const kmInput = screen.getByRole('textbox', { name: 'Khmer item name' }) as HTMLInputElement;
    fireEvent.change(kmInput, { target: { value: 'តែគុជពិសេស' } });

    // 2. Now enter English and blur
    const enInput = screen.getByRole('textbox', { name: 'English item name' }) as HTMLInputElement;
    fireEvent.change(enInput, { target: { value: 'Special Milk Tea' } });
    fireEvent.blur(enInput);

    await waitFor(() => {
      // Manual Khmer correction must be preserved, not overwritten by AI draft!
      expect((screen.getByRole('textbox', { name: 'Khmer item name' }) as HTMLInputElement).value).toBe('តែគុជពិសេស');
    });
  });

  it('displays confirmation control when language is ambiguous', async () => {
    render(
      <TranslationEditor
        label="Item Name"
        fieldName="item name"
        clientKey="item-ambiguous"
        field="name"
      />
    );

    const enInput = screen.getByRole('textbox', { name: 'English item name' });
    fireEvent.change(enInput, { target: { value: '100% 500ml' } });

    expect(
      screen.getByText(/Language ambiguous\. Please confirm original language:/i)
    ).toBeDefined();
  });

  it('shows error banner with retry and save original only on failure', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'AI service unavailable' }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    render(
      <TranslationEditor
        label="Item Name"
        fieldName="item name"
        clientKey="item-fail"
        field="name"
      />
    );

    const enInput = screen.getByRole('textbox', { name: 'English item name' });
    fireEvent.change(enInput, { target: { value: 'Brown Sugar' } });
    fireEvent.blur(enInput);

    await waitFor(() => {
      expect(screen.getByText(/Translation failed/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Save original only/i })).toBeDefined();
    });

    // Clicking save original only dismisses the error
    fireEvent.click(screen.getByRole('button', { name: /Save original only/i }));
    expect(screen.queryByText(/Translation failed/i)).toBeNull();
  });
});
