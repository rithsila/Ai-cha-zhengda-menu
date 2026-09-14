import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isMuted,
  setMuted,
  unlockAlerts,
  setupAutoUnlock,
  _resetAudioContextForTesting,
} from './alert';

describe('alert utility and audio unlock', () => {
  let resumeMock: ReturnType<typeof vi.fn>;
  let mockAudioContext: any;

  beforeEach(() => {
    localStorage.clear();
    _resetAudioContextForTesting();
    resumeMock = vi.fn().mockResolvedValue(undefined);

    mockAudioContext = {
      state: 'suspended',
      resume: resumeMock,
      currentTime: 0,
      createOscillator: vi.fn().mockReturnValue({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn().mockReturnThis(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn().mockReturnThis(),
      }),
      destination: {},
    };

    (window as any).AudioContext = vi.fn(function () {
      return mockAudioContext;
    });
  });

  it('handles mute preference in localStorage', () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it('resumes suspended AudioContext on unlockAlerts', () => {
    unlockAlerts();
    expect(resumeMock).toHaveBeenCalled();
  });

  it('attaches auto-unlock listeners to window and cleans up on first user gesture', () => {
    const cleanup = setupAutoUnlock();

    // Trigger pointerdown
    window.dispatchEvent(new Event('pointerdown'));
    expect(resumeMock).toHaveBeenCalled();

    cleanup();
  });
});
