import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Globe,
  Search,
  Save,
  RotateCcw,
  AlertTriangle,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { API_BASE, authHeaders, loadSession } from '../../lib/api';
import { Button, CustomSelect, useToast } from '../ui';
import { MenuLanguagePreview, type PreviewItemData } from './MenuLanguagePreview';
import type { Locale } from './useTranslationDraft';

export interface LocalizedCellData {
  locale: Locale;
  text: string;
  status?: string;
  sourceRevision?: number;
  basedOnSourceRevision?: number | null;
}

export interface LocalizedTextItem {
  id: string;
  ownerType: string;
  ownerKey: string;
  field: 'name' | 'description';
  sourceLocale: Locale | null;
  sourceText?: string;
  ownerLabel?: string;
  revision: number;
  sourceRevision: number;
  cells: LocalizedCellData[];
}

export interface TranslationsListResponse {
  page?: number;
  limit?: number;
  total?: number;
  items: LocalizedTextItem[];
}

const ownerTypeOptions = [
  { value: 'all', label: 'All Content Types' },
  { value: 'item', label: 'Menu Items' },
  { value: 'category', label: 'Categories' },
  { value: 'modifierGroup', label: 'Modifier Groups' },
  { value: 'modifierOption', label: 'Modifier Options' },
];

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'missing', label: 'Missing Translations' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'unreviewed', label: 'AI Drafts / Unreviewed' },
];

function formatOwnerType(type: string): string {
  if (type === 'item' || type === 'menu_item') return 'Item';
  if (type === 'category') return 'Category';
  if (type === 'modifierGroup' || type === 'modifier_group') return 'Modifier Group';
  if (type === 'modifierOption' || type === 'modifier_option') return 'Modifier Option';
  return type;
}

export function LanguageManagement() {
  const { toast } = useToast();
  const sessionRole = loadSession()?.role;
  const isManager = sessionRole === 'manager';

  const [items, setItems] = useState<LocalizedTextItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Local pending edits: recordId -> { en?: string, km?: string, zh?: string }
  const [edits, setEdits] = useState<Record<string, Partial<Record<Locale, string>>>>({});
  const [saving, setSaving] = useState(false);

  // Concurrency conflict modal state
  const [conflict, setConflict] = useState<{
    id: string;
    serverRecord?: LocalizedTextItem;
    localDraft: Partial<Record<Locale, string>>;
  } | null>(null);

  // Preview modal
  const [previewItem, setPreviewItem] = useState<PreviewItemData | null>(null);
  const [previewDrafts, setPreviewDrafts] = useState<{
    name?: Partial<Record<Locale, string>>;
    description?: Partial<Record<Locale, string>>;
  } | undefined>(undefined);

  // Unsaved changes confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onProceed: () => void;
  } | null>(null);

  const hasUnsavedChanges = useMemo(() => {
    return Object.keys(edits).length > 0;
  }, [edits]);

  // Fetch translations
  const fetchTranslations = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', String(limit));
      if (ownerTypeFilter !== 'all') params.set('ownerType', ownerTypeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`${API_BASE}/api/translations?${params.toString()}`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          throw new Error('Access denied: Manager privileges required.');
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load translations');
      }

      const data: TranslationsListResponse = await res.json();
      setItems(data.items || []);
      const count = typeof data.total === 'number' && !isNaN(data.total) ? data.total : (data.items?.length || 0);
      setTotal(count);
      const currPage = typeof data.page === 'number' && !isNaN(data.page) ? data.page : targetPage;
      setPage(currPage);
    } catch (err: any) {
      setError(err.message || 'Failed to load translations');
    } finally {
      setLoading(false);
    }
  }, [ownerTypeFilter, statusFilter, searchQuery, page, limit]);

  useEffect(() => {
    fetchTranslations(1);
  }, [ownerTypeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    guardAction(() => {
      fetchTranslations(1);
    });
  };

  // Guard navigation/filter changes if there are unsaved edits
  const guardAction = (action: () => void) => {
    if (hasUnsavedChanges) {
      setConfirmModal({
        title: 'Unsaved Changes',
        message: 'You have unsaved edits. Are you sure you want to proceed and discard them?',
        onProceed: () => {
          setEdits({});
          setConfirmModal(null);
          action();
        },
      });
    } else {
      action();
    }
  };

  const handlePageChange = (newPage: number) => {
    guardAction(() => {
      setPage(newPage);
      fetchTranslations(newPage);
    });
  };

  // Cell editing
  const handleCellChange = (itemId: string, locale: Locale, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [locale]: value,
      },
    }));
  };

  const getCellValue = (item: LocalizedTextItem, locale: Locale): string => {
    const editVal = edits[item.id]?.[locale];
    if (editVal !== undefined) return editVal;
    return item.cells?.find((c) => c.locale === locale)?.text || '';
  };

  // Save all changed records
  const handleSaveChanges = async () => {
    const changedIds = Object.keys(edits);
    if (changedIds.length === 0) return;

    setSaving(true);
    setError(null);

    const editsPayload = changedIds.map((id) => {
      const rec = items.find((i) => i.id === id);
      const cellMap = edits[id] || {};
      const locales: Locale[] = ['en', 'km', 'zh'];

      return {
        id,
        expectedRevision: rec?.revision,
        cells: locales.map((loc) => {
          const text = cellMap[loc] !== undefined
            ? cellMap[loc]!
            : rec?.cells?.find((c) => c.locale === loc)?.text || '';
          return {
            locale: loc,
            text,
            status: 'reviewed',
          };
        }),
      };
    });

    try {
      const res = await fetch(`${API_BASE}/api/translations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ edits: editsPayload }),
      });

      if (!res.ok) {
        if (res.status === 409) {
          // Conflict!
          const data = await res.json().catch(() => ({}));
          const conflictingId = changedIds[0];
          const serverRec = data.serverRecords?.find((r: any) => r.id === conflictingId);
          setConflict({
            id: conflictingId,
            serverRecord: serverRec,
            localDraft: edits[conflictingId] || {},
          });
          throw new Error('A revision conflict occurred. Another manager modified this content.');
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save translations');
      }

      toast({
        title: 'Translations saved',
        description: `Successfully updated ${changedIds.length} item(s).`,
        variant: 'success',
      });
      setEdits({});
      await fetchTranslations(page);
    } catch (err: any) {
      setError(err.message || 'Failed to save translations');
      toast({
        title: 'Save failed',
        description: err.message || 'Could not save translations.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setEdits({});
    toast({ title: 'Edits discarded', variant: 'info' });
  };

  // Open Preview for an item
  const handleOpenPreview = (item: LocalizedTextItem) => {
    const effectiveSourceLocale = item.sourceLocale || 'en';
    const defaultName = item.ownerLabel || item.sourceText || item.ownerKey;
    const rawName = item.field === 'name' ? (getCellValue(item, effectiveSourceLocale) || defaultName) : defaultName;
    const rawDesc = item.field === 'description' ? getCellValue(item, effectiveSourceLocale) : '';

    const draftsData = edits[item.id]
      ? { [item.field]: edits[item.id] }
      : undefined;

    setPreviewDrafts(draftsData);
    setPreviewItem({
      id: item.ownerKey,
      name: rawName,
      description: rawDesc,
      basePrice: 2.5,
      category: item.ownerType === 'category' ? rawName : undefined,
      localized: {
        [item.field]: {
          sourceLocale: effectiveSourceLocale,
          cells: (['en', 'km', 'zh'] as Locale[]).map((l) => ({
            locale: l,
            text: getCellValue(item, l),
          })),
        },
      },
    });
  };

  if (!isManager) {
    return (
      <div
        className="rounded-none border border-border bg-surface p-8 text-center space-y-3"
        role="alert"
      >
        <div className="flex justify-center text-amber-500">
          <AlertTriangle className="size-8" />
        </div>
        <h3 className="text-base font-bold text-ink">Manager Access Required</h3>
        <p className="text-xs text-ink-soft max-w-md mx-auto">
          Translation and multilingual menu management is restricted to manager accounts. Please contact an administrator if you need access.
        </p>
      </div>
    );
  }

  const safeTotal = typeof total === 'number' && !isNaN(total) ? total : (items?.length || 0);
  const safePage = typeof page === 'number' && !isNaN(page) ? page : 1;
  const totalPages = Math.max(1, Math.ceil(safeTotal / limit));
  const startIdx = safeTotal === 0 ? 0 : (safePage - 1) * limit + 1;
  const endIdx = Math.min(safePage * limit, safeTotal);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-ink">Languages & Translations</h3>
          <p className="text-xs text-ink-soft">
            Manage English, Khmer, and Chinese translations with real-time customer preview
          </p>
        </div>

        {/* Global Save / Discard Actions */}
        {hasUnsavedChanges && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDiscard}
              disabled={saving}
              className="gap-1 rounded-none font-bold"
            >
              <RotateCcw className="size-3.5" />
              Discard
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={saving}
              onClick={handleSaveChanges}
              className="gap-1.5 rounded-none font-bold shadow-sm"
            >
              <Save className="size-4" />
              Save Changes ({Object.keys(edits).length})
            </Button>
          </div>
        )}
      </div>

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              You have <strong>{Object.keys(edits).length}</strong> unsaved translation edit(s).
              Remember to save before leaving.
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={saving}
              className="font-bold underline hover:no-underline cursor-pointer"
            >
              Save now
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="font-medium underline hover:no-underline text-ink-soft cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between gap-2 bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
          <span>{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => fetchTranslations(page)}
            className="text-xs font-bold underline"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface p-3">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-64">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-soft" />
            <input
              type="text"
              placeholder="Search items, descriptions, or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full bg-surface-sunken border border-border pl-9 pr-3 text-xs font-medium text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="!h-9 px-3 text-xs font-bold">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Content Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-ink-soft">Type:</span>
            <CustomSelect
              aria-label="Filter content type"
              value={ownerTypeFilter}
              options={ownerTypeOptions}
              onChange={(nextType) => {
                guardAction(() => setOwnerTypeFilter(nextType));
              }}
              size="sm"
              buttonClassName="!h-9 text-xs"
              className="min-w-40"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-ink-soft">Status:</span>
            <CustomSelect
              aria-label="Filter translation status"
              value={statusFilter}
              options={statusOptions}
              onChange={(nextStatus) => {
                guardAction(() => setStatusFilter(nextStatus));
              }}
              size="sm"
              buttonClassName="!h-9 text-xs"
              className="min-w-44"
            />
          </div>
        </div>
      </div>

      {/* Translations Table / Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center border border-dashed border-border bg-surface text-xs text-ink-soft">
          <RefreshCw className="size-5 animate-spin text-accent mr-2" />
          <span>Loading translations...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border bg-surface text-center space-y-2">
          <Globe className="size-8 text-ink-soft" />
          <p className="text-sm font-bold text-ink">No translations match your filter</p>
          <p className="text-xs text-ink-soft">
            Try clearing filters or search queries to view all menu translations.
          </p>
        </div>
      ) : (
        <div className="border border-border bg-surface overflow-x-auto shadow-xs">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                <th className="p-3 w-56">Item / Field</th>
                <th className="p-3">English</th>
                <th className="p-3">Khmer</th>
                <th className="p-3">Chinese</th>
                <th className="p-3 w-20 text-center">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const isEdited = Boolean(edits[item.id]);
                const displayName =
                  item.ownerLabel ||
                  item.sourceText ||
                  item.cells?.find((c) => c.locale === 'en')?.text ||
                  item.cells?.find((c) => c.locale === item.sourceLocale)?.text ||
                  item.cells?.find((c) => Boolean(c.text))?.text ||
                  item.ownerKey;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors hover:bg-surface-sunken/30 ${
                      isEdited ? 'bg-accent/5' : ''
                    }`}
                  >
                    {/* Item Metadata */}
                    <td className="p-3 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft border border-border">
                            {formatOwnerType(item.ownerType)}
                          </span>
                          <span className="text-[10px] text-accent font-bold bg-accent/10 px-1.5 py-0.2 rounded">
                            Orig: {item.sourceLocale ? item.sourceLocale.toUpperCase() : 'AUTO'}
                          </span>
                        </div>
                        <div className="font-bold text-xs text-ink truncate max-w-56" title={displayName}>
                          {displayName}
                        </div>
                        {item.ownerKey !== displayName && (
                          <div className="font-mono text-[10px] text-ink-faint truncate max-w-56" title={item.ownerKey}>
                            {item.ownerKey}
                          </div>
                        )}
                        <div className="text-[11px] text-ink-soft font-medium capitalize">
                          {item.field}
                        </div>
                        {isEdited && (
                          <span className="inline-block text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            ● Unsaved
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Three Language Columns */}
                    {(['en', 'km', 'zh'] as Locale[]).map((loc) => {
                      const value = getCellValue(item, loc);
                      const isSource = Boolean(item.sourceLocale && loc === item.sourceLocale);
                      const cell = item.cells?.find((c) => c.locale === loc);

                      return (
                        <td key={loc} className="p-3 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              {isSource ? (
                                <span className="font-bold text-accent">Original</span>
                              ) : cell?.text ? (
                                cell.status === 'reviewed' ? (
                                  <span className="text-emerald-600 font-semibold">Reviewed ✓</span>
                                ) : (
                                  <span className="text-amber-600 font-semibold">AI Draft</span>
                                )
                              ) : (
                                <span className="text-red-500 font-semibold">Missing</span>
                              )}
                            </div>
                            <input
                              type="text"
                              aria-label={`${loc === 'en' ? 'English' : loc === 'km' ? 'Khmer' : 'Chinese'} ${item.ownerKey} ${item.field}`}
                              value={value}
                              onChange={(e) => handleCellChange(item.id, loc, e.target.value)}
                              className={`h-9 w-full rounded border bg-surface px-2.5 text-xs font-medium text-ink outline-none transition-colors ${
                                isSource
                                  ? 'border-accent/50 focus:border-accent'
                                  : 'border-border focus:border-ink-soft'
                              }`}
                            />
                          </div>
                        </td>
                      );
                    })}

                    {/* Preview Button */}
                    <td className="p-3 align-top text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Preview ${item.ownerKey}`}
                        onClick={() => handleOpenPreview(item)}
                        className="rounded-none hover:bg-surface-sunken text-ink-soft hover:text-ink"
                        title="Preview customer card"
                      >
                        <Eye className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
        <span className="text-ink-soft">
          Showing <strong>{startIdx}</strong> to <strong>{endIdx}</strong> of{' '}
          <strong>{safeTotal}</strong> records
        </span>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={safePage <= 1 || loading}
            onClick={() => handlePageChange(safePage - 1)}
            aria-label="Previous Page"
            className="rounded-none font-bold gap-1"
          >
            <ChevronLeft className="size-3.5" />
            Prev
          </Button>

          <span className="font-mono text-xs text-ink font-semibold px-2">
            {safePage} / {totalPages}
          </span>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={safePage >= totalPages || loading}
            onClick={() => handlePageChange(safePage + 1)}
            aria-label="Next Page"
            className="rounded-none font-bold gap-1"
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Customer Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-sm">
            <MenuLanguagePreview
              item={previewItem}
              drafts={previewDrafts}
              onClose={() => {
                setPreviewItem(null);
                setPreviewDrafts(undefined);
              }}
            />
          </div>
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {conflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-surface border border-red-500/40 p-6 shadow-2xl space-y-4 rounded-none">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
              <AlertTriangle className="size-5" />
              <span>Translation Conflict (HTTP 409)</span>
            </div>
            <p className="text-xs text-ink-soft">
              Another staff member updated this record while you were editing. How would you like to proceed?
            </p>

            <div className="space-y-2 border border-border p-3 bg-surface-sunken text-xs">
              <div className="font-bold text-ink">Your pending draft:</div>
              <div className="text-ink-soft">
                EN: {conflict.localDraft.en || '—'} | KM: {conflict.localDraft.km || '—'} | ZH: {conflict.localDraft.zh || '—'}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  // Discard local draft for this item
                  const nextEdits = { ...edits };
                  delete nextEdits[conflict.id];
                  setEdits(nextEdits);
                  setConflict(null);
                  fetchTranslations(page);
                }}
              >
                Use Server Version
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  // Keep local edits, dismiss conflict dialog, and retry
                  setConflict(null);
                  fetchTranslations(page);
                }}
              >
                Keep My Changes & Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Unsaved Changes Modal */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-surface border border-border p-6 shadow-2xl space-y-4 rounded-none">
            <h4 className="font-bold text-base text-ink">{confirmModal.title}</h4>
            <p className="text-xs text-ink-soft">{confirmModal.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmModal(null)}
              >
                Keep Editing
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={confirmModal.onProceed}
              >
                Discard & Proceed
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
