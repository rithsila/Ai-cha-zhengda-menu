/*
 * New-order alert: a short two-note chime plus a haptic buzz.
 *
 * Why WebAudio and not an <audio> file: no asset to ship, no decode latency, and
 * the tone can be re-triggered while the previous one is still ringing. The
 * counter is loud, so the chime is a rising fifth (880 -> 1320 Hz) — a shape that
 * cuts through espresso-machine noise better than a single flat beep.
 *
 * Browsers refuse to start an AudioContext without a user gesture. The staff PIN
 * submit is the one tap guaranteed to happen before any order can arrive, so
 * `unlockAlerts()` is called there. Without it the first chime of the shift would
 * be silently dropped.
 */

const MUTE_KEY = 'staff-alert-muted';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Call from a real user gesture (the PIN submit) so the first chime is audible. */
export function unlockAlerts(): void {
  const audio = getContext();
  if (audio && audio.state === 'suspended') {
    void audio.resume();
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* private mode — mute simply does not persist across reloads */
  }
}

function tone(audio: AudioContext, freq: number, startAt: number, length: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  // Exponential decay, never to exactly 0 — Web Audio cannot ramp to zero.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + length + 0.02);
}

/** Chime + vibrate for a newly arrived order. No-ops when muted. */
export function playNewOrderAlert(): void {
  if (isMuted()) return;

  const audio = getContext();
  if (audio) {
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    tone(audio, 880, t, 0.16);
    tone(audio, 1320, t + 0.14, 0.26);
  }

  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    /* unsupported — the chime is the primary signal */
  }
}
