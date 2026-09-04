import React, {
  useState,
  useRef,
  useEffect,
  useId,
  useCallback,
  useMemo,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption<T extends string | number = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export type CustomSelectSize = 'sm' | 'md' | 'lg';

export interface CustomSelectProps<T extends string | number = string> {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  options?: CustomSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  size?: CustomSelectSize;
  fullWidth?: boolean;
  'aria-label'?: string;
  children?: ReactNode;
}

const sizeClasses: Record<CustomSelectSize, { button: string; menu: string; option: string; text: string }> = {
  sm: {
    button: 'h-8 px-2.5 text-xs',
    menu: 'py-1 text-xs',
    option: 'px-2.5 py-1.5 text-xs',
    text: 'text-xs',
  },
  md: {
    button: 'h-10 px-3 text-xs sm:text-sm',
    menu: 'py-1 text-xs sm:text-sm',
    option: 'px-3 py-2 text-xs sm:text-sm',
    text: 'text-xs sm:text-sm',
  },
  lg: {
    button: 'h-11 px-3 text-sm',
    menu: 'py-1 text-sm',
    option: 'px-3 py-2.5 text-sm',
    text: 'text-sm',
  },
};

export function CustomSelect<T extends string | number = string>({
  value,
  defaultValue,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  id,
  name,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  optionClassName = '',
  size = 'md',
  fullWidth = true,
  'aria-label': ariaLabel,
  children,
}: CustomSelectProps<T>) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const listboxId = `${selectId}-listbox`;

  const [internalValue, setInternalValue] = useState<T>(
    (value !== undefined ? value : defaultValue ?? ('' as unknown as T))
  );
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  // Extract options from props or children
  const parsedOptions = useMemo<CustomSelectOption<T>[]>(() => {
    if (options && options.length > 0) {
      return options;
    }
    const extracted: CustomSelectOption<T>[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const props = child.props as { value?: unknown; children?: ReactNode; disabled?: boolean };
        if (props && props.value !== undefined) {
          extracted.push({
            value: props.value as T,
            label: props.children ?? String(props.value),
            disabled: Boolean(props.disabled),
          });
        }
      }
    });
    return extracted;
  }, [options, children]);

  const selectedOption = useMemo(() => {
    return parsedOptions.find((opt) => String(opt.value) === String(currentValue));
  }, [parsedOptions, currentValue]);

  const selectedIndex = useMemo(() => {
    return parsedOptions.findIndex((opt) => String(opt.value) === String(currentValue));
  }, [parsedOptions, currentValue]);

  // Handle outside click to close
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (val: T) => {
      if (!isControlled) {
        setInternalValue(val);
      }
      onChange?.(val);
      setIsOpen(false);
      buttonRef.current?.focus();
    },
    [isControlled, onChange]
  );

  const openMenu = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    const initialIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setHighlightedIndex(initialIndex);
  }, [disabled, selectedIndex]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  const getNextEnabledIndex = useCallback(
    (startIndex: number, direction: 1 | -1): number => {
      const count = parsedOptions.length;
      if (count === 0) return -1;
      let next = startIndex + direction;
      while (next >= 0 && next < count) {
        if (!parsedOptions[next].disabled) {
          return next;
        }
        next += direction;
      }
      return startIndex;
    },
    [parsedOptions]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement | HTMLUListElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (!isOpen) {
          openMenu();
        } else {
          setHighlightedIndex((prev) => getNextEnabledIndex(prev, 1));
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (!isOpen) {
          openMenu();
        } else {
          setHighlightedIndex((prev) => getNextEnabledIndex(prev, -1));
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        if (isOpen && parsedOptions.length > 0) {
          const first = parsedOptions.findIndex((o) => !o.disabled);
          if (first !== -1) setHighlightedIndex(first);
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        if (isOpen && parsedOptions.length > 0) {
          for (let i = parsedOptions.length - 1; i >= 0; i--) {
            if (!parsedOptions[i].disabled) {
              setHighlightedIndex(i);
              break;
            }
          }
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (!isOpen) {
          openMenu();
        } else if (highlightedIndex >= 0 && highlightedIndex < parsedOptions.length) {
          const opt = parsedOptions[highlightedIndex];
          if (!opt.disabled) {
            handleSelect(opt.value);
          }
        }
        break;
      }
      case 'Escape': {
        if (isOpen) {
          e.preventDefault();
          closeMenu();
        }
        break;
      }
      case 'Tab': {
        if (isOpen) {
          setIsOpen(false);
        }
        break;
      }
      default:
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listboxRef.current && highlightedIndex >= 0) {
      const items = listboxRef.current.querySelectorAll('[role="option"]');
      const item = items[highlightedIndex] as HTMLElement | undefined;
      if (typeof item?.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, highlightedIndex]);

  const sizeStyle = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      ref={containerRef}
      className={[
        'relative inline-block rounded-none text-left',
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Hidden input for standard form serialization */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={currentValue !== undefined ? String(currentValue) : ''}
        />
      )}

      {/* Button trigger */}
      <button
        ref={buttonRef}
        type="button"
        id={selectId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-disabled={disabled}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleKeyDown}
        className={[
          'group flex w-full items-center justify-between gap-2 rounded-none border border-border bg-surface font-semibold text-ink transition-colors',
          'hover:bg-surface-sunken/60 focus:border-accent focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          sizeStyle.button,
          buttonClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="truncate">
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-ink-soft">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={[
            'size-4 shrink-0 text-ink-soft transition-transform duration-150',
            isOpen ? 'rotate-180 text-ink' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown listbox */}
      {isOpen && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={selectId}
          onKeyDown={handleKeyDown}
          className={[
            'absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-none border border-border bg-surface shadow-raised outline-none',
            sizeStyle.menu,
            menuClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {parsedOptions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ink-soft">No options</li>
          ) : (
            parsedOptions.map((opt, index) => {
              const isSelected = String(opt.value) === String(currentValue);
              const isHighlighted = index === highlightedIndex;

              return (
                <li
                  key={`${String(opt.value)}-${index}`}
                  role="option"
                  id={`${selectId}-opt-${index}`}
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  data-highlighted={isHighlighted}
                  data-selected={isSelected}
                  onClick={() => {
                    if (!opt.disabled) {
                      handleSelect(opt.value);
                    }
                  }}
                  onMouseEnter={() => {
                    if (!opt.disabled) {
                      setHighlightedIndex(index);
                    }
                  }}
                  className={[
                    'relative flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-none text-left font-medium transition-colors',
                    sizeStyle.option,
                    isSelected ? 'font-bold text-ink bg-surface-sunken/40' : 'text-ink',
                    isHighlighted ? 'bg-surface-sunken' : '',
                    opt.disabled
                      ? 'cursor-not-allowed opacity-40 hover:bg-transparent'
                      : 'hover:bg-surface-sunken',
                    optionClassName,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check
                      className="size-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
