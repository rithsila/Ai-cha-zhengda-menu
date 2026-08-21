import { useState, useRef, useEffect } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import {
  X,
  Upload,
  Plus,
  Trash2,
  Image as ImageIcon,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Button, Segmented, useToast } from './ui';
import { API_BASE, authHeaders } from '../lib/api';

export type ModifierOptionInput = {
  id?: string;
  key?: string;
  name: string;
  priceDelta: number;
};

export type ModifierGroupInput = {
  id?: string;
  key?: string;
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  options: ModifierOptionInput[];
};

export type MenuItemFull = {
  id?: string;
  brand: string;
  category: string;
  name: string;
  description?: string | null;
  basePrice: number;
  image?: string | null;
  isSoldOut?: boolean;
  isActive?: boolean;
  modifiers?: ModifierGroupInput[];
};

type Props = {
  isOpen: boolean;
  item: MenuItemFull | null;
  onClose: () => void;
  onSaved: () => void;
};

export function MenuItemEditModal({ isOpen, item, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [brand, setBrand] = useState<'ai-cha' | 'zhengda'>('ai-cha');
  const [category, setCategory] = useState('Milk Tea');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('1.50');
  const [image, setImage] = useState('');
  const [modifiers, setModifiers] = useState<ModifierGroupInput[]>([]);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (item) {
      setBrand(item.brand.toLowerCase() === 'zhengda' ? 'zhengda' : 'ai-cha');
      setCategory(item.category || '');
      setName(item.name || '');
      setDescription(item.description || '');
      setBasePrice(String(item.basePrice ?? '1.50'));
      setImage(item.image || '');
      setModifiers(
        item.modifiers?.map((g) => ({
          id: g.id,
          key: g.key,
          name: g.name,
          type: g.type,
          required: g.required,
          options: g.options.map((o) => ({
            id: o.id,
            key: o.key,
            name: o.name,
            priceDelta: o.priceDelta,
          })),
        })) || []
      );
    } else {
      setBrand('ai-cha');
      setCategory('Milk Tea');
      setName('');
      setDescription('');
      setBasePrice('1.50');
      setImage('');
      setModifiers([]);
    }
    setError(null);
  }, [item, isOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(item?.id);

  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setImage(data.url);
      toast({ title: 'Image uploaded', variant: 'success' });
    } catch {
      setError('Failed to upload image. Ensure it is PNG/JPG under 5MB.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Modifier Groups Management
  const addModifierGroup = () => {
    setModifiers((prev) => [
      ...prev,
      {
        key: `group_${Date.now()}`,
        name: 'New Custom Group',
        type: 'single',
        required: false,
        options: [{ key: `opt_${Date.now()}`, name: 'Option 1', priceDelta: 0 }],
      },
    ]);
  };

  const removeModifierGroup = (groupIndex: number) => {
    setModifiers((prev) => prev.filter((_, idx) => idx !== groupIndex));
  };

  const updateGroup = (groupIndex: number, field: keyof ModifierGroupInput, value: any) => {
    setModifiers((prev) =>
      prev.map((g, idx) => (idx === groupIndex ? { ...g, [field]: value } : g))
    );
  };

  const addOptionToGroup = (groupIndex: number) => {
    setModifiers((prev) =>
      prev.map((g, idx) =>
        idx === groupIndex
          ? {
              ...g,
              options: [
                ...g.options,
                { key: `opt_${Date.now()}`, name: 'New Option', priceDelta: 0 },
              ],
            }
          : g
      )
    );
  };

  const removeOptionFromGroup = (groupIndex: number, optionIndex: number) => {
    setModifiers((prev) =>
      prev.map((g, idx) =>
        idx === groupIndex
          ? { ...g, options: g.options.filter((_, oIdx) => oIdx !== optionIndex) }
          : g
      )
    );
  };

  const updateOption = (
    groupIndex: number,
    optionIndex: number,
    field: keyof ModifierOptionInput,
    value: any
  ) => {
    setModifiers((prev) =>
      prev.map((g, idx) =>
        idx === groupIndex
          ? {
              ...g,
              options: g.options.map((opt, oIdx) =>
                oIdx === optionIndex ? { ...opt, [field]: value } : opt
              ),
            }
          : g
      )
    );
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanCategory = category.trim();
    const parsedPrice = Number(basePrice);

    if (!cleanName) {
      setError('Item name is required.');
      return;
    }
    if (!cleanCategory) {
      setError('Category is required.');
      return;
    }
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Please enter a valid price (>= 0).');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      brand,
      category: cleanCategory,
      name: cleanName,
      description: description.trim() || undefined,
      basePrice: parsedPrice,
      image: image.trim() || undefined,
      modifiers: modifiers.map((g) => ({
        key: g.key || `group_${Date.now()}`,
        name: g.name.trim(),
        type: g.type,
        required: g.required,
        options: g.options.map((o) => ({
          key: o.key || `opt_${Date.now()}`,
          name: o.name.trim(),
          priceDelta: Number(o.priceDelta) || 0,
        })),
      })),
    };

    try {
      const url = isEditing
        ? `${API_BASE}/api/catalog/${item!.id}`
        : `${API_BASE}/api/catalog`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast({
        title: isEditing ? 'Menu Item Updated' : 'Menu Item Created',
        description: `${cleanName} is now live on the menu.`,
        variant: 'success',
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save menu item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    if (!window.confirm(`Are you sure you want to remove "${item.name}" from the menu?`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/catalog/${item.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');

      toast({
        title: 'Menu Item Removed',
        description: `${item.name} has been removed.`,
        variant: 'info',
      });
      onSaved();
      onClose();
    } catch {
      setError('Could not delete item. Please check permissions.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent text-on-accent">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">
                {isEditing ? `Edit: ${item?.name}` : 'Add New Menu Item'}
              </h3>
              <p className="text-xs text-ink-soft">
                Configure prices, toppings, sugar/ice levels, and pictures
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger-soft p-3 text-xs font-semibold text-danger">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Brand & Category */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Brand
              </label>
              <Segmented
                options={[
                  { id: 'ai-cha', label: 'Ai-Cha' },
                  { id: 'zhengda', label: 'Zhengda' },
                ]}
                value={brand}
                onChange={(val) => setBrand(val as 'ai-cha' | 'zhengda')}
                ariaLabel="Select Brand"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Category
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Milk Tea, Ice Cream, Signature, Frappe"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink focus:border-accent outline-none"
              />
            </div>
          </div>

          {/* Name & Base Price */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Item Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Brown Sugar Boba Milk"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink focus:border-accent outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Base Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="1.50"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-ink focus:border-accent outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Short appetizing description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface p-3 text-sm font-medium text-ink focus:border-accent outline-none"
            />
          </div>

          {/* Image Upload / URL */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
              Item Image
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex size-20 items-center justify-center rounded-xl border border-border bg-surface-sunken overflow-hidden">
                {image ? (
                  <img
                    src={image.startsWith('http') || image.startsWith('/') ? `${API_BASE}${image}`.replace(/([^:]\/)\/+/g, '$1') : image}
                    alt="Preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = image; // fallback to raw path
                    }}
                  />
                ) : (
                  <ImageIcon className="size-6 text-ink-faint" />
                )}
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    loading={uploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    Upload Image
                  </Button>

                  {image && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => setImage('')}
                      className="text-danger"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Or enter image path: /images/boba.webp"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs font-mono text-ink-soft outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Modifiers & Options Section (Ice, Sugar, Size, Toppings) */}
          <div className="border-t border-border pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-accent" />
                <h4 className="text-sm font-bold text-ink">
                  Modifiers &amp; Toppings ({modifiers.length})
                </h4>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={addModifierGroup}
                className="text-xs font-bold"
              >
                <Plus className="size-3.5" />
                Add Group (e.g. Topping/Sugar)
              </Button>
            </div>

            {modifiers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-ink-faint">
                No modifiers configured. Tap above to add Size, Ice, Sugar level, or Toppings.
              </div>
            ) : (
              <div className="space-y-4">
                {modifiers.map((group, gIdx) => (
                  <div
                    key={gIdx}
                    className="rounded-xl border border-border bg-surface-sunken/40 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-48">
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) => updateGroup(gIdx, 'name', e.target.value)}
                          placeholder="Group name (e.g. Ice Level)"
                          className="h-8 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-ink focus:border-accent outline-none"
                        />
                        <select
                          value={group.type}
                          onChange={(e) => updateGroup(gIdx, 'type', e.target.value)}
                          className="h-8 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-ink outline-none"
                        >
                          <option value="single">Single Choice</option>
                          <option value="multiple">Multiple Choice (e.g. Toppings)</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-ink-soft cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.required}
                            onChange={(e) => updateGroup(gIdx, 'required', e.target.checked)}
                            className="rounded text-accent"
                          />
                          <span>Required</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeModifierGroup(gIdx)}
                        className="p-1 text-danger hover:bg-danger-soft rounded"
                        title="Remove group"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* Options list */}
                    <div className="space-y-2 pl-2">
                      {group.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt.name}
                            onChange={(e) =>
                              updateOption(gIdx, oIdx, 'name', e.target.value)
                            }
                            placeholder="Option name (e.g. Boba)"
                            className="h-8 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-ink focus:border-accent outline-none"
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-ink-faint">+$</span>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              value={opt.priceDelta}
                              onChange={(e) =>
                                updateOption(
                                  gIdx,
                                  oIdx,
                                  'priceDelta',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              placeholder="0.00"
                              className="h-8 w-20 rounded-lg border border-border bg-surface px-2 text-xs font-bold text-ink focus:border-accent outline-none tabular-nums"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeOptionFromGroup(gIdx, oIdx)}
                            className="p-1 text-ink-faint hover:text-danger rounded"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => addOptionToGroup(gIdx)}
                        className="text-xs text-accent mt-1"
                      >
                        <Plus className="size-3" />
                        Add Option Choice
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger hover:bg-danger-soft"
                loading={deleting}
                onClick={handleDelete}
              >
                <Trash2 className="size-4" />
                Delete Item
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {isEditing ? 'Save Changes' : 'Create Menu Item'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
