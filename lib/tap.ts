// Minimal tap feedback: a short vibration + a very quiet click.
const KEY = 'ledger.feedback';

let ctx: AudioContext | null = null;

export function feedbackOn(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(KEY) !== '0';
}

export function setFeedback(on: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, on ? '1' : '0');
}

type Variant = 'light' | 'key' | 'confirm' | 'back';

const TONE: Record<Variant, { f: number; g: number; d: number; v: number }> = {
  light: { f: 1180, g: 0.022, d: 0.028, v: 8 },
  key: { f: 900, g: 0.03, d: 0.03, v: 6 },
  confirm: { f: 1560, g: 0.035, d: 0.06, v: 16 },
  back: { f: 620, g: 0.026, d: 0.035, v: 10 },
};

export function tap(variant: Variant = 'light') {
  if (typeof window === 'undefined' || !feedbackOn()) return;
  const t = TONE[variant];

  try {
    navigator.vibrate?.(t.v);
  } catch {}

  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(t.f, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(t.g, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + t.d + 0.01);
  } catch {}
}
