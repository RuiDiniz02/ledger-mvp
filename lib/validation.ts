import { validMoneyAccounts } from './accounts';

/** Validate persisted/imported data before any money calculation can consume it. */
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const cents = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0 && Number(x) <= 99999999999;
const month = (x: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(x) && x >= '2000-01' && x <= '2100-12';
const date = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && month(x.slice(0, 7)) && Number.isFinite(new Date(x).getTime()) && new Date(x).toISOString().slice(0, 10) === x;
const uniqueIds = (xs: unknown[]) => xs.every(x => record(x) && typeof x.id === 'string' && x.id.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(x.id)) && new Set(xs.map(x => (x as Record<string, unknown>).id)).size === xs.length;

export function validLedger(d: Record<string, unknown>): boolean {
  if (!validMoneyAccounts(d.moneyAccounts)) return false;
  if (!Array.isArray(d.cats) || !Array.isArray(d.tx) || !record(d.months) || !uniqueIds(d.cats) || !uniqueIds(d.tx)) return false;
  if (!d.cats.every(c => record(c) && typeof c.name === 'string' && ['fixed', 'variable', 'saving'].includes(String(c.kind)) && ['bar', 'circle', 'ring', 'diamond', 'stack', 'dot', 'plus', 'square'].includes(String(c.mark)) && ['c', 'cl', 'cd'].every(k => typeof c[k] === 'string') && (c.goal === undefined || cents(c.goal)))) return false;
  if (!d.tx.every(t => record(t) && typeof t.cat === 'string' && cents(t.amount) && date(t.date) && typeof t.note === 'string' && ['mine', 'split'].includes(String(t.scope)) && Number.isInteger(t.pct) && Number(t.pct) >= 0 && Number(t.pct) <= 100 && ['me', 'partner'].includes(String(t.paidBy)) && ['manual', 'bank', 'recurring'].includes(String(t.source)))) return false;
  return Object.entries(d.months).every(([ym, b]) => month(ym) && record(b) && cents(b.ceiling) && record(b.targets) && Object.values(b.targets).every(cents) && (b.added === undefined || cents(b.added)) && (b.extra === undefined || (Array.isArray(b.extra) && uniqueIds(b.extra) && b.extra.every(e => record(e) && cents(e.amount) && ['carry', 'freed', 'outside'].includes(String(e.from)) && (e.to === null || typeof e.to === 'string')))));
}
