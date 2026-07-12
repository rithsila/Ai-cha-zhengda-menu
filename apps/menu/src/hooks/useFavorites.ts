import { useState, useEffect } from 'react';

const FAVORITES_KEY = 'ai_cha_menu_favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load favorites from localStorage', e);
    }
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      let next: string[];
      if (prev.includes(id)) {
        next = prev.filter(f => f !== id);
      } else {
        next = [...prev, id];
      }
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save favorites to localStorage', e);
      }
      return next;
    });
  };

  const isFavorite = (id: string) => favorites.includes(id);

  return { favorites, toggleFavorite, isFavorite };
}
