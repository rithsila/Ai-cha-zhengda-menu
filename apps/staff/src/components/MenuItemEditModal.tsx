import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import {
  X,
  Upload,
  Plus,
  Trash2,
  Image as ImageIcon,
  Layers,
  Sparkles,
  AlertCircle,
  Award
} from 'lucide-react';
import { Button } from './ui/Button';
import { CustomSelect } from './ui/CustomSelect';
import { Switch } from './ui/Switch';
import { useToast } from './ui/Toast';
import { API_BASE, apiFetch, authHeaders, resolveImageUrl } from '../lib/api';

import type { Category } from './CategoryManagementModal';

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
  brand?: string;
  category: string;
  name: string;
  description?: string | null;
  basePrice: number;
  image?: string | null;
  isSoldOut?: boolean;
  isActive?: boolean;
  earnsStamp?: boolean;
  canClaim?: boolean;
  modifiers?: ModifierGroupInput[];
};

const DEFAULT_DRINK_MODIFIERS: ModifierGroupInput[] = [
  {
    name: 'Size / Cup Type',
    type: 'single',
    required: true,
    options: [
      { name: 'Hot (400ml)', priceDelta: 0 },
      { name: 'Cold M (500ml)', priceDelta: 0 },
      { name: 'Cold L (700ml)', priceDelta: 0.25 },
    ],
  },
  {
    name: 'Ice Level',
    type: 'single',
    required: true,
    options: [
      { name: 'No Ice', priceDelta: 0 },
      { name: 'Less Ice', priceDelta: 0 },
      { name: 'Normal Ice', priceDelta: 0 },
      { name: 'More Ice', priceDelta: 0 },
    ],
  },
  {
    name: 'Sugar Level',
    type: 'single',
    required: true,
    options: [
      { name: '0%', priceDelta: 0 },
      { name: '25%', priceDelta: 0 },
      { name: '50%', priceDelta: 0 },
      { name: '75%', priceDelta: 0 },
      { name: '100%', priceDelta: 0 },
    ],
  },
  {
    name: 'Toppings',
    type: 'multiple',
    required: false,
    options: [
      { name: 'Boba Pearl', priceDelta: 0.25 },
      { name: 'Coconut Jelly', priceDelta: 0.25 },
      { name: 'Oats', priceDelta: 0.25 },
      { name: 'Oolong Tea Jelly', priceDelta: 0.25 },
      { name: 'Brown Sugar Jelly', priceDelta: 0.25 },
      { name: 'Red Bean', priceDelta: 0.25 },
    ],
  },
];

const DEFAULT_FOOD_MODIFIERS: ModifierGroupInput[] = [
  {
    name: 'Flavor Powder',
    type: 'single',
    required: true,
    options: [
      { name: 'Signature', priceDelta: 0 },
      { name: 'Mala', priceDelta: 0 },
      { name: 'Plum', priceDelta: 0 },
      { name: 'Cumin', priceDelta: 0 },
    ],
  },
  {
    name: 'Signature Sauce',
    type: 'single',
    required: false,
    options: [
      { name: 'No Sauce', priceDelta: 0 },
      { name: 'Sweet & Chili', priceDelta: 0 },
      { name: 'Mala Sauce', priceDelta: 0 },
      { name: 'Blackpepper', priceDelta: 0 },
    ],
  },
];

function cloneModifierPreset(preset: ModifierGroupInput[]): ModifierGroupInput[] {
  return preset.map((g, gIdx) => ({
    key: `group_${Date.now()}_${gIdx}`,
    name: g.name,
    type: g.type,
    required: g.required,
    options: g.options.map((o, oIdx) => ({
      key: `opt_${Date.now()}_${gIdx}_${oIdx}`,
      name: o.name,
      priceDelta: o.priceDelta,
    })),
  }));
}

type Props = {
  isOpen: boolean;
  item: MenuItemFull | null;
  onClose: () => void;
  onSaved: () => void;
};

export function MenuItemEditModal({ isOpen, item, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [brand, setBrand] = useState<string>('default');
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('1.50');
  const [image, setImage] = useState('');
  const [earnsStamp, setEarnsStamp] = useState(true);
  const [canClaim, setCanClaim] = useState(false);
  const [modifiers, setModifiers] = useState<ModifierGroupInput[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
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

  const [availableTabs, setAvailableTabs] = useState<Array<{ id: string; label: string }>>([
    { id: 'ai-cha', label: 'Ai-Cha' },
    { id: 'zhengda', label: 'Zhengda' },
  ]);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch<any>('/api/store/status')
      .then((data) => {
        if (data?.menuTabsConfig) {
          try {
            const parsed = typeof data.menuTabsConfig === 'string'
              ? JSON.parse(data.menuTabsConfig)
              : data.menuTabsConfig;
            if (Array.isArray(parsed)) {
              const enabled = parsed
                .filter((t: any) => t.enabled !== false && t.id)
                .map((t: any) => ({
                  id: String(t.id).trim().toLowerCase(),
                  label: String(t.label || t.id).trim(),
                }));
              if (enabled.length > 0) {
                setAvailableTabs(enabled);
              }
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const tabOptions = useMemo(() => {
    const options = availableTabs.map((t) => ({ value: t.id, label: t.label }));
    if (brand && !options.some((o) => o.value.toLowerCase() === brand.toLowerCase())) {
      options.push({ value: brand, label: brand === 'default' ? 'Default / Both' : brand });
    }
    return options;
  }, [availableTabs, brand]);

  useEffect(() => {
    if (item) {
      setBrand(item.brand ? item.brand.toLowerCase() : 'ai-cha');
      setCategory(item.category || '');
      setName(item.name || '');
      setDescription(item.description || '');
      setBasePrice(String(item.basePrice ?? '1.50'));
      setImage(item.image || '');
      setEarnsStamp(item.earnsStamp !== undefined ? Boolean(item.earnsStamp) : true);
      setCanClaim(item.canClaim !== undefined ? Boolean(item.canClaim) : false);
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
      setCategory('');
      setName('');
      setDescription('');
      setBasePrice('1.50');
      setImage('');
      setEarnsStamp(true);
      setCanClaim(false);
      setModifiers(cloneModifierPreset(DEFAULT_DRINK_MODIFIERS));
    }
    setIsAddingCategory(false);
    setNewCategoryName('');
    setError(null);
  }, [item, isOpen]);

  const itemCategory = item?.category;

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingCategories(true);

    fetch(`${API_BASE}/api/categories`, {
      headers: authHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to fetch categories');
        }
        return res.json();
      })
      .then((data: Category[]) => {
        if (!isMounted) return;
        setCategories(data);

        if (itemCategory) {
          setCategory(itemCategory);
          return;
        }

        if (data.length > 0) {
          setCategory(data[0].name);
        } else {
          setCategory('');
        }
      })
      .catch((err) => {
        console.error('Error fetching categories:', err);
        if (isMounted) {
          setCategories([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingCategories(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, itemCategory]);

  const handleQuickAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast({
        title: 'Category name is required',
        variant: 'error',
      });
      return;
    }

    setCreatingCategory(true);
    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ brand, name: trimmed }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add category');
      }

      const createdName = data.name || trimmed;
      setCategories((prev) => {
        if (prev.some((c) => c.name.toLowerCase() === createdName.toLowerCase())) {
          return prev;
        }
        return [
          ...prev,
          data.id
            ? data
            : {
                id: `cat_${Date.now()}`,
                brand,
                name: createdName,
                sortOrder: prev.length,
                isActive: true,
              },
        ];
      });

      setCategory(createdName);
      setIsAddingCategory(false);
      setNewCategoryName('');
      toast({
        title: 'Category created',
        description: `"${createdName}" has been added and selected.`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Could not create category',
        description: err.message || 'An error occurred',
        variant: 'error',
      });
    } finally {
      setCreatingCategory(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const opts = categories.map((c) => ({
      value: c.name,
      label: c.name,
    }));
    if (category && !opts.some((o) => o.value.toLowerCase() === category.trim().toLowerCase())) {
      opts.unshift({
        value: category,
        label: category,
      });
    }
    return opts;
  }, [categories, category]);

  const isEditing = Boolean(item?.id);

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select or paste an image file.',
          variant: 'error',
        });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setError('Image is too large. Maximum size is 5MB.');
        toast({
          title: 'Image too large',
          description: 'Maximum allowed image size is 5MB.',
          variant: 'error',
        });
        return;
      }

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
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Upload failed');
        }
        const data = await res.json();
        setImage(data.url);
        toast({ title: 'Image uploaded', variant: 'success' });
      } catch (err: any) {
        setError(err?.message || 'Failed to upload image. Ensure it is PNG/JPG under 5MB.');
        toast({
          title: 'Upload failed',
          description: err?.message || 'Could not upload image',
          variant: 'error',
        });
      } finally {
        setUploadingImage(false);
      }
    },
    [toast]
  );

  const handleImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadImageFile(file);
    e.target.value = '';
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const clipboardFiles = e.clipboardData?.files;
      let imageFile: File | null = null;

      if (clipboardFiles && clipboardFiles.length > 0) {
        for (let i = 0; i < clipboardFiles.length; i++) {
          if (clipboardFiles[i].type.startsWith('image/')) {
            imageFile = clipboardFiles[i];
            break;
          }
        }
      }

      if (!imageFile && e.clipboardData?.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const blob = items[i].getAsFile();
            if (blob) {
              imageFile = blob;
              break;
            }
          }
        }
      }

      if (imageFile) {
        e.preventDefault();
        uploadImageFile(imageFile);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, uploadImageFile]);


  // Modifier Groups Management
  const loadDrinkPreset = () => {
    setModifiers(cloneModifierPreset(DEFAULT_DRINK_MODIFIERS));
  };

  const loadFoodPreset = () => {
    setModifiers(cloneModifierPreset(DEFAULT_FOOD_MODIFIERS));
  };

  const clearAllModifiers = () => {
    setModifiers([]);
  };

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
      earnsStamp,
      canClaim,
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-none border border-border bg-surface shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-none bg-accent text-on-accent">
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
            className="rounded-none p-1.5 text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-none bg-danger-soft p-3 text-xs font-semibold text-danger">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Menu Tab & Category */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Menu Tab / Brand */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Menu Tab / Brand
              </label>
              <CustomSelect
                value={brand}
                onChange={(val) => setBrand(val)}
                options={tabOptions}
                placeholder="Select Menu Tab"
                aria-label="Menu Tab / Brand"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Category
              </label>
              {isAddingCategory ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickAddCategory();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsAddingCategory(false);
                        setNewCategoryName('');
                      }
                    }}
                    className="h-10 flex-1 rounded-none border border-border bg-surface px-3 text-sm font-medium text-ink focus:border-accent outline-none"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    loading={creatingCategory}
                    onClick={handleQuickAddCategory}
                    className="h-10 px-3 text-xs font-bold shrink-0"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={creatingCategory}
                    onClick={() => {
                      setIsAddingCategory(false);
                      setNewCategoryName('');
                    }}
                    className="h-10 px-3 text-xs font-bold shrink-0"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <CustomSelect
                      value={category}
                      onChange={(val) => setCategory(val)}
                      options={categoryOptions}
                      placeholder={loadingCategories ? 'Loading categories...' : 'Select category'}
                      disabled={loadingCategories}
                      aria-label="Category"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setIsAddingCategory(true);
                      setNewCategoryName('');
                    }}
                    className="h-10 px-3 text-xs font-bold shrink-0"
                  >
                    <Plus className="size-3.5" />
                    New
                  </Button>
                </div>
              )}
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
                className="h-10 w-full rounded-none border border-border bg-surface px-3 text-sm font-medium text-ink focus:border-accent outline-none"
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
                className="h-10 w-full rounded-none border border-border bg-surface px-3 text-sm font-bold text-ink focus:border-accent outline-none tabular-nums"
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
              className="w-full rounded-none border border-border bg-surface p-3 text-sm font-medium text-ink focus:border-accent outline-none"
            />
          </div>

          {/* Image Upload / URL */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
              Item Image
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) uploadImageFile(file);
              }}
              className={`flex flex-wrap items-center gap-4 p-3 border border-dashed transition-colors ${
                isDragging ? 'border-accent bg-accent/10' : 'border-border bg-surface-sunken/30'
              }`}
            >
              <div className="relative flex size-20 items-center justify-center rounded-none border border-border bg-surface-sunken overflow-hidden shrink-0">
                {image ? (
                  <img
                    src={resolveImageUrl(image)}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="size-6 text-ink-faint" />
                )}
              </div>

              <div className="flex-1 space-y-2 min-w-[220px]">
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
                <p className="text-[11px] text-ink-soft">
                  Press <kbd className="px-1 py-0.5 rounded-xs bg-surface border border-border font-mono text-[10px] text-ink">Ctrl+V</kbd> or <kbd className="px-1 py-0.5 rounded-xs bg-surface border border-border font-mono text-[10px] text-ink">⌘V</kbd> to paste screenshot / image, or drag &amp; drop here.
                </p>
              </div>
            </div>
          </div>

          {/* Stamp & Loyalty Reward Settings */}
          <div className="border-t border-border pt-5 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="size-4 text-accent" />
              <h4 className="text-sm font-bold text-ink">Stamp &amp; Reward Rules</h4>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-none border border-border bg-surface-sunken/40 p-3.5">
                <div className="pr-3">
                  <p className="text-xs font-bold text-ink">Earns Stamp</p>
                  <p className="text-[11px] text-ink-soft">Customer gets 1 stamp on purchase</p>
                </div>
                <Switch
                  checked={earnsStamp}
                  onChange={setEarnsStamp}
                  srLabel="Allow reward stamp"
                />
              </div>

              <div className="flex items-center justify-between rounded-none border border-border bg-surface-sunken/40 p-3.5">
                <div className="pr-3">
                  <p className="text-xs font-bold text-ink">Free Claim Item</p>
                  <p className="text-[11px] text-ink-soft">Can be claimed with 10 stamps</p>
                </div>
                <Switch
                  checked={canClaim}
                  onChange={setCanClaim}
                  srLabel="Allow free claim with stamps"
                />
              </div>
            </div>
          </div>

          {/* Options & Toppings Section (Size, Ice, Sugar, Toppings, Flavor, Sauce) */}
          <div className="border-t border-border pt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-accent" />
                <h4 className="text-sm font-bold text-ink">
                  Options &amp; Toppings ({modifiers.length})
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={loadDrinkPreset}
                  className="text-xs font-semibold"
                  title="Load standard Drink options (Size, Ice, Sugar, Toppings)"
                >
                  Drink Presets
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={loadFoodPreset}
                  className="text-xs font-semibold"
                  title="Load standard Food options (Flavor, Sauce)"
                >
                  Food Presets
                </Button>
                {modifiers.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={clearAllModifiers}
                    className="text-xs font-semibold text-danger hover:bg-danger-soft"
                    title="Remove all option groups"
                  >
                    Clear All
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={addModifierGroup}
                  className="text-xs font-bold"
                >
                  <Plus className="size-3.5" />
                  Add Custom Group
                </Button>
              </div>
            </div>

            {modifiers.length === 0 ? (
              <div className="rounded-none border border-dashed border-border p-4 text-center text-xs text-ink-faint space-y-2">
                <p>No options configured for this item.</p>
                <div className="flex justify-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={loadDrinkPreset}
                    className="text-xs"
                  >
                    Load Drink Options
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={loadFoodPreset}
                    className="text-xs"
                  >
                    Load Food Options
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {modifiers.map((group, gIdx) => (
                  <div
                    key={gIdx}
                    className="rounded-none border border-border bg-surface-sunken/40 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-48">
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) => updateGroup(gIdx, 'name', e.target.value)}
                          placeholder="Group name (e.g. Ice Level)"
                          className="h-8 flex-1 rounded-none border border-border bg-surface px-2.5 text-xs font-bold text-ink focus:border-accent outline-none"
                        />
                        <CustomSelect<'single' | 'multiple'>
                          value={group.type}
                          onChange={(val) => updateGroup(gIdx, 'type', val)}
                          options={[
                            { value: 'single', label: 'Single Choice' },
                            { value: 'multiple', label: 'Multiple Choice (e.g. Toppings)' },
                          ]}
                          size="sm"
                          fullWidth={false}
                          className="min-w-44"
                        />
                        <label className="flex items-center gap-1 text-xs text-ink-soft cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.required}
                            onChange={(e) => updateGroup(gIdx, 'required', e.target.checked)}
                            className="rounded-none text-accent"
                          />
                          <span>Required</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeModifierGroup(gIdx)}
                        className="p-1 text-danger hover:bg-danger-soft rounded-none"
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
                            className="h-8 flex-1 rounded-none border border-border bg-surface px-2.5 text-xs font-medium text-ink focus:border-accent outline-none"
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
                              className="h-8 w-20 rounded-none border border-border bg-surface px-2 text-xs font-bold text-ink focus:border-accent outline-none tabular-nums"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeOptionFromGroup(gIdx, oIdx)}
                            className="p-1 text-ink-faint hover:text-danger rounded-none"
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
