import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  delay?: number;
  moveTolerance?: number;
}

export function useLongPress({
  onLongPress,
  onClick,
  delay = 450,
  moveTolerance = 10,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressActiveRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerHaptic = useCallback(() => {
    try {
      const tw = (window as any).Telegram?.WebApp;
      if (tw?.HapticFeedback?.impactOccurred) {
        tw.HapticFeedback.impactOccurred('medium');
        return;
      }
    } catch {
      // Ignore
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(40);
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isLongPressActiveRef.current = false;
    clearTimer();

    timerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      triggerHaptic();
      onLongPress();
    }, delay);
  }, [delay, clearTimer, triggerHaptic, onLongPress]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current || !timerRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > moveTolerance || dy > moveTolerance) {
      clearTimer();
    }
  }, [moveTolerance, clearTimer]);

  const onPointerUp = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
  }, [clearTimer]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLongPressActiveRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressActiveRef.current = false;
      return;
    }
    onClick?.();
  }, [onClick]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (isLongPressActiveRef.current || timerRef.current) {
      e.preventDefault();
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave: onPointerCancel,
    onClick: handleClick,
    onContextMenu,
  };
}
