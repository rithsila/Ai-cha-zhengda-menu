import { useTranslation } from 'react-i18next';
import { Ghost, MagnifyingGlass } from '@phosphor-icons/react';
import { Button } from './Button';

/** Skeleton card matching MenuItemCard dimensions for loading state */
export function MenuItemSkeleton() {
  return (
    <div className="bg-tg-secondary-bg rounded-2xl overflow-hidden animate-pulse flex flex-col">
      <div className="h-32 bg-tg-hint/10" />
      <div className="p-3 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="h-4 bg-tg-hint/15 rounded-md w-3/4 mb-2" />
          <div className="h-3 bg-tg-hint/10 rounded-md w-full mb-1" />
          <div className="h-3 bg-tg-hint/10 rounded-md w-2/3" />
        </div>
        <div className="h-10 bg-tg-hint/15 rounded-xl" />
      </div>
    </div>
  );
}

/** Grid of skeleton cards for loading state */
export function MenuGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <MenuItemSkeleton key={i} />
      ))}
    </div>
  );
}


interface EmptyMenuStateProps {
  type?: 'search' | 'category';
  onAction?: () => void;
}

/** Empty state for when a category has no items or search yields no results */
export function EmptyMenuState({ type = 'category', onAction }: EmptyMenuStateProps) {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-6 text-tg-hint/80">
        {type === 'search' ? (
          <MagnifyingGlass size={40} weight="duotone" />
        ) : (
          <Ghost size={40} weight="duotone" />
        )}
      </div>
      <h3 className="font-bold text-lg mb-2">
        {type === 'search' ? t('noResultsTitle', 'No matches found') : t('emptyCategoryTitle', "It's quiet here")}
      </h3>
      <p className="text-tg-hint text-sm mb-6 max-w-[250px]">
        {type === 'search' 
          ? t('noResultsDesc', 'We couldn\'t find anything for that search. Try a different keyword.') 
          : t('noItemsInCategory', 'This category is currently empty.')}
      </p>
      {onAction && (
        <Button onClick={onAction} className="px-8">
          {type === 'search' ? t('clearSearch', 'Clear Search') : t('viewAll', 'View All')}
        </Button>
      )}
    </div>
  );
}
