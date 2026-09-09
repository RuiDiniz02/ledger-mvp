import type { Lang } from './types';

export const CURRENCY = '\u20ac';

export function money(cents: number, dec = true, lang: Lang = 'en') {
  const loc = lang === 'pt' ? 'pt-PT' : 'en-IE';
  const v = Math.abs(cents) / 100;
  const s = new Intl.NumberFormat(loc, {
    minimumFractionDigits: dec ? 2 : 0,
    maximumFractionDigits: dec ? 2 : 0,
  }).format(dec ? v : Math.round(v));
  return (cents < 0 ? '\u2212' : '') + CURRENCY + s;
}

export function dayLabel(dateIso: string, lang: Lang, now = new Date()) {
  const t = dateIso === isoLocal(now);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (t) return lang === 'pt' ? 'Hoje' : 'Today';
  if (dateIso === isoLocal(y)) return lang === 'pt' ? 'Ontem' : 'Yesterday';
  const [yy, m, d] = dateIso.split('-').map(Number);
  return new Date(yy, m - 1, d).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-IE', { day: 'numeric', month: 'short' });
}

function isoLocal(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}
