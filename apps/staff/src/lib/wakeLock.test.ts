import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isWakeLockSupported,
  getWakeLockPreference,
  setWakeLockPreference,
  isWakeLockActive,
  requestWakeLock,
  releaseWakeLock,
  subscribeWakeLock,
  initWakeLockLifecycle,
} from './wakeLock';

describe('wakeLock utility', () => {
  let releaseMock: ReturnType<typeof vi.fn>;
  let mockSentinel: any;

  beforeEach(() => {
    localStorage.clear();
    releaseMock = vi.fn().mockImplementation(() => {
      mockSentinel.released = true;
      return Promise.resolve();
    });

    mockSentinel = {
      released: false,
      release: releaseMock,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Mock navigator.wakeLock
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      configurable: true,
      value: {
        request: vi.fn().mockResolvedValue(mockSentinel),
      },
    });
  });

  afterEach(async () => {
    await releaseWakeLock();
    vi.restoreAllMocks();
  });

  it('detects wake lock support correctly', () => {
    expect(isWakeLockSupported()).toBe(true);
  });

  it('defaults preference to true (always on for POS tablet)', () => {
    expect(getWakeLockPreference()).toBe(true);
  });

  it('persists preference in localStorage', () => {
    setWakeLockPreference(false);
    expect(getWakeLockPreference()).toBe(false);
    expect(localStorage.getItem('staff-wake-lock-enabled')).toBe('0');

    setWakeLockPreference(true);
    expect(getWakeLockPreference()).toBe(true);
    expect(localStorage.getItem('staff-wake-lock-enabled')).toBe('1');
  });

  it('requests and releases wake lock successfully', async () => {
    const requested = await requestWakeLock();
    expect(requested).toBe(true);
    expect(isWakeLockActive()).toBe(true);

    await releaseWakeLock();
    expect(releaseMock).toHaveBeenCalled();
    expect(isWakeLockActive()).toBe(false);
  });

  it('notifies subscribers on state changes', async () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeWakeLock(subscriber);

    expect(subscriber).toHaveBeenCalledWith(false);

    await requestWakeLock();
    expect(subscriber).toHaveBeenCalledWith(true);

    await releaseWakeLock();
    expect(subscriber).toHaveBeenCalledWith(false);

    unsubscribe();
  });

  it('re-requests wake lock on visibilitychange when visible', async () => {
    setWakeLockPreference(true);
    const cleanup = initWakeLockLifecycle();

    // Trigger visibility change
    Object.defineProperty(document, 'visibilityState', {
      writable: true,
      configurable: true,
      value: 'visible',
    });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');

    cleanup();
  });
});
