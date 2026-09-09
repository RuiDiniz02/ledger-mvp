const nf = new Intl.NumberFormat('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const CURRENCY = '\u20ac';

/** minor units -> display string */
export function money(cents: number, dec = true) {
  const v = Math.abs(cents) / 100;
  return (cents < 0 ? '\u2212' : '') + CURRENCY + (dec ? nf.format(v) : nf0.format(Math.round(v)));
}

export function dayLabel(dateIso: string, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString().slice(0, 10);
  if (dateIso === today) return 'Today';
  if (dateIso === y) return 'Yesterday';
  const [, m, d] = dateIso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return parseInt(d, 10) + ' ' + months[parseInt(m, 10) - 1];
}
