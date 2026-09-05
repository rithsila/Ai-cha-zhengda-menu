import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FormEvent } from 'react';
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Check,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { useToast } from './ui/Toast';
import { Skeleton } from './ui/Skeleton';
import { API_BASE, authHeaders } from '../lib/api';
import type { MenuItemFull } from './MenuItemEditModal';

export interface Category {
  id: string;
  brand?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CategoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  items?: MenuItemFull[];
  onUpdated?: () => void;
}

export function CategoryManagementModal({
  isOpen,
  onClose,
  items = [],
  onUpdated,
}: CategoryManagementModalProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add category state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [adding, setAdding] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Reorder loading state
  const [reordering, setReordering] = useState(false);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingId, onClose]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch categories');
      }
      const data = await res.json();
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      setEditingId(null);
      setNewCategoryName('');
    }
  }, [isOpen, fetchCategories]);

  // Count items per category
  const categoryItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (item.category) {
        const key = item.category.trim().toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [items]);

  // Add category
  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = newCategoryName.trim();
    if (!cleanName) return;

    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: cleanName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add category');
      }

      toast({
        title: 'Category created',
        description: `"${cleanName}" has been added.`,
        variant: 'success',
      });
      setNewCategoryName('');
      await fetchCategories();
      onUpdated?.();
    } catch (err: any) {
      toast({
        title: 'Could not create category',
        description: err.message || 'An error occurred',
        variant: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  // Reorder categories
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (reordering) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const nextCategories = [...categories];
    const temp = nextCategories[index];
    nextCategories[index] = nextCategories[targetIndex];
    nextCategories[targetIndex] = temp;

    const reorderedPayload = nextCategories.map((cat, idx) => ({
      id: cat.id,
      sortOrder: idx,
    }));

    setCategories(nextCategories);
    setReordering(true);

    try {
      const res = await fetch(`${API_BASE}/api/categories/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ items: reorderedPayload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reorder categories');
      }
      toast({
        title: 'Categories reordered',
        variant: 'success',
      });
      onUpdated?.();
    } catch (err: any) {
      toast({
        title: 'Reorder failed',
        description: err.message || 'Failed to update order',
        variant: 'error',
      });
      await fetchCategories();
    } finally {
      setReordering(false);
    }
  };

  // Inline rename
  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const handleSaveEdit = async (cat: Category) => {
    const cleanName = editingName.trim();
    if (!cleanName) return;
    if (cleanName === cat.name) {
      setEditingId(null);
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`${API_BASE}/api/categories/${cat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: cleanName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to rename category');
      }

      toast({
        title: 'Category renamed',
        description: `Renamed to "${cleanName}".`,
        variant: 'success',
      });
      setEditingId(null);
      await fetchCategories();
      onUpdated?.();
    } catch (err: any) {
      toast({
        title: 'Could not rename category',
        description: err.message || 'An error occurred',
        variant: 'error',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete category
  const handleDelete = async (cat: Category) => {
    if (!window.confirm(`Are you sure you want to delete "${cat.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/categories/${cat.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete category');
      }

      toast({
        title: 'Category deleted',
        description: `"${cat.name}" was removed.`,
        variant: 'success',
      });
      await fetchCategories();
      onUpdated?.();
    } catch (err: any) {
      toast({
        title: 'Could not delete category',
        description: err.message || 'Category cannot be deleted',
        variant: 'error',
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-none border border-border bg-surface shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-none bg-accent text-on-accent">
              <Layers className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">Manage Categories</h3>
              <p className="text-xs text-ink-soft">
                Add, reorder, rename, or delete menu categories
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-none p-1.5 text-ink-soft hover:bg-surface-sunken hover:text-ink cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-none bg-danger-soft p-3 text-xs font-semibold text-danger">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Add Category Row */}
          <form onSubmit={handleAddCategory} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New category name..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="h-10 flex-1 bg-surface border border-border px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent font-sans transition-colors rounded-none"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!newCategoryName.trim() || adding}
              loading={adding}
              className="font-medium rounded-none"
            >
              <Plus className="size-4" />
              Add
            </Button>
          </form>

          {/* Categories List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Current Categories ({categories.length})
            </h4>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-none" />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-soft border border-dashed border-border">
                No categories found. Add your first category above.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border bg-surface">
                {categories.map((cat, index) => {
                  const itemCount = categoryItemCounts.get(cat.name.trim().toLowerCase()) || 0;
                  const isEditing = editingId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 gap-3 transition-colors hover:bg-surface-sunken/40"
                    >
                      {isEditing ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit(cat);
                              } else if (e.key === 'Escape') {
                                setEditingId(null);
                              }
                            }}
                            autoFocus
                            className="h-8 flex-1 bg-surface border border-accent px-2 text-sm text-ink focus:outline-none rounded-none"
                          />
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            aria-label="Save"
                            loading={savingEdit}
                            onClick={() => handleSaveEdit(cat)}
                            className="h-8 px-2 text-xs"
                          >
                            <Check className="size-3.5 mr-1" />
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            aria-label="Cancel"
                            disabled={savingEdit}
                            onClick={() => setEditingId(null)}
                            className="h-8 px-2 text-xs"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs text-ink-faint w-5">
                              {index + 1}.
                            </span>
                            <span className="font-medium text-sm text-ink truncate">
                              {cat.name}
                            </span>
                            <Badge variant="neutral" className="font-mono text-[10px]">
                              {itemCount} items
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Move Up"
                              disabled={index === 0 || reordering}
                              onClick={() => handleMove(index, 'up')}
                              className="size-8 p-0"
                            >
                              <ArrowUp className="size-4" />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Move Down"
                              disabled={index === categories.length - 1 || reordering}
                              onClick={() => handleMove(index, 'down')}
                              className="size-8 p-0"
                            >
                              <ArrowDown className="size-4" />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Edit"
                              onClick={() => handleStartEdit(cat)}
                              className="size-8 p-0"
                            >
                              <Edit2 className="size-3.5" />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Delete"
                              onClick={() => handleDelete(cat)}
                              className="size-8 p-0 text-danger hover:bg-danger-soft hover:text-danger"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border px-6 py-3 bg-surface-sunken/20">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="font-medium text-xs h-9 px-4 rounded-none"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
