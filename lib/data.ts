import { SCHEMA, type Category, type CatState, type Kind, type Ledger, type MarkKind, type MonthBudget, type Tx } from './types';

/** Collision-proof even when several rows are created in the same millisecond. */
export function uid(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return prefix + crypto.randomUUID().slice(0, 12);
  } catch {}
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Expenses whose category was deleted are shown under this pseudo-category, so
 * the month total always equals the sum of what is on screen.
 */
export const UNCAT_ID = '__uncat';
export const UNCAT: Category = { id: UNCAT_ID, name: 'Uncategorised', kind: 'variable', mark: 'dot', c: '#7f8aa3', cl: '#b7c0d2', cd: '#59637a' };
export const uncatFor = (lang: string): Category => ({ ...UNCAT, name: lang === 'pt' ? 'Sem categoria' : 'Uncategorised' });
export const orphanTx = (l: Ledger, ym: string) => {
  const known = new Set(l.cats.map((c) => c.id));
  return txOfMonth(l, ym).filter((t) => !known.has(t.cat));
};

export const PALETTE = [
  { c: '#6c7ff2', cl: '#a3b0ff', cd: '#4757c9' },
  { c: '#3cb37c', cl: '#86dcae', cd: '#217f56' },
  { c: '#f4874b', cl: '#ffbd91', cd: '#c85f26' },
  { c: '#d9a441', cl: '#f2d391', cd: '#a87519' },
  { c: '#17a8c0', cl: '#7fd9e6', cd: '#0b7b8f' },
  { c: '#a878e2', cl: '#d3b6f7', cd: '#7a4bb5' },
  { c: '#ec6a86', cl: '#ffa9ba', cd: '#bc3f5c' },
  { c: '#7f8aa3', cl: '#b7c0d2', cd: '#59637a' },
];

export const MARKS: MarkKind[] = ['circle', 'ring', 'diamond', 'square', 'plus', 'stack', 'bar', 'dot'];

export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

export const ymOf = (dateIso: string) => dateIso.slice(0, 7);
export const ymNow = () => iso(new Date()).slice(0, 7);

export function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return iso(d).slice(0, 7);
}

export function ymLabel(ym: string, lang: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-IE', { month: 'long', year: 'numeric' });
}

/** Day-of-month context, but only for the month actually being viewed. */
export function monthMeta(ym: string, now = new Date()) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const isCurrent = ym === iso(now).slice(0, 7);
  const past = ym < iso(now).slice(0, 7);
  const day = isCurrent ? now.getDate() : past ? days : 0;
  return { day, days, isCurrent, past, daysLeft: Math.max(1, days - day + 1) };
}

export function emptyLedger(): Ledger {
  return { v: SCHEMA, workspace: '', lang: 'en', onboarded: false, cats: [], months: {}, tx: [] };
}

/** Suggested starter categories offered during setup. Everything stays editable. */
export const STARTERS: Array<{ key: string; en: string; pt: string; kind: Kind; ci: number; mark: MarkKind }> = [
  { key: 'bills', en: 'Fixed Bills', pt: 'Contas Fixas', kind: 'fixed', ci: 0, mark: 'bar' },
  { key: 'grocery', en: 'Groceries', pt: 'Supermercado', kind: 'variable', ci: 1, mark: 'circle' },
  { key: 'dining', en: 'Dining & Leisure', pt: 'Restaurantes e Lazer', kind: 'variable', ci: 2, mark: 'ring' },
  { key: 'transport', en: 'Transport', pt: 'Transportes', kind: 'variable', ci: 3, mark: 'diamond' },
  { key: 'invest', en: 'Investments', pt: 'Investimentos', kind: 'saving', ci: 4, mark: 'stack' },
  { key: 'emerg', en: 'Emergency Fund', pt: 'Fundo de Emergência', kind: 'saving', ci: 5, mark: 'dot' },
  { key: 'health', en: 'Health', pt: 'Saúde', kind: 'variable', ci: 6, mark: 'plus' },
  { key: 'subs', en: 'Subscriptions', pt: 'Subscrições', kind: 'fixed', ci: 7, mark: 'square' },
];

export function makeCategory(name: string, kind: Kind, ci: number, index: number): Category {
  return { id: uid('c'), name, kind, mark: MARKS[index % MARKS.length], ...PALETTE[ci % PALETTE.length] };
}

/** Returns the budget for a month, seeding it from the most recent earlier month. */
export function monthBudget(l: Ledger, ym: string): MonthBudget {
  if (l.months[ym]) return l.months[ym];
  const prev = Object.keys(l.months).filter((k) => k < ym).sort().pop();
  if (prev) return { ceiling: l.months[prev].ceiling, targets: { ...l.months[prev].targets } };
  return { ceiling: 0, targets: {} };
}

/** Call inside update() before writing month-scoped values. */
export function ensureMonth(draft: Ledger, ym: string) {
  if (!draft.months[ym]) draft.months[ym] = monthBudget(draft, ym);
  return draft.months[ym];
}

export const txOfMonth = (l: Ledger, ym: string) => l.tx.filter((t) => ymOf(t.date) === ym);
export const spentBy = (l: Ledger, ym: string, catId: string) =>
  txOfMonth(l, ym).filter((t) => t.cat === catId).reduce((a, t) => a + t.amount, 0);
export const totalSpent = (l: Ledger, ym: string) => txOfMonth(l, ym).reduce((a, t) => a + t.amount, 0);
export const allocated = (b: MonthBudget, cats: Category[]) =>
  cats.reduce((a, c) => a + (b.targets[c.id] || 0), 0);

/**
 * What a category takes out of the month's ceiling.
 *
 * Setting a target is allocation, not spending: money planned for groceries or
 * rent is still yours until it actually leaves, so those cost what was logged.
 * A pot is the exception. Its contribution really does leave the money you can
 * spend, so it counts from the 1st. Money taken back *out* of a pot never
 * counts, because it was already charged to the month that saved it.
 */
export function used(kind: Kind, target: number, spent: number): number {
  return kind === 'saving' ? Math.max(0, target) : spent;
}

/** Warning model: variable warns at 80% (configurable) then 100%. */
export function catState(kind: Kind, target: number, spent: number, warnAt = 80): CatState {
  if (kind === 'saving') return target > 0 ? 'funded' : spent > 0 ? 'empty' : 'ok';
  if (target <= 0) return spent > 0 ? 'empty' : 'ok';
  const pct = spent / target;
  if (pct > 1) return 'over';
  // A fixed bill is meant to land on its number, so filling up is not a warning.
  if (kind === 'fixed') return pct >= 0.995 ? 'funded' : 'ok';
  if (pct >= warnAt / 100) return 'near';
  return 'ok';
}

/** Every month from the first one on record up to and including `ym`. */
export function monthsUpTo(l: Ledger, ym: string, cap = 600): string[] {
  const keys = Object.keys(l.months).sort();
  let cur = keys.length && keys[0] < ym ? keys[0] : ym;
  if (cur > ym) return [];
  const out: string[] = [];
  while (cur <= ym && out.length < cap) { out.push(cur); cur = shiftYm(cur, 1); }
  return out;
}

/**
 * A pot's balance as of the end of `ym`: every monthly contribution since the
 * ledger began, minus everything taken back out of it. Months the user never
 * opened still count, because monthBudget seeds them from the last one set.
 */
export function potBalance(l: Ledger, catId: string, ym: string): number {
  const paidIn = monthsUpTo(l, ym).reduce((a, k) => a + (monthBudget(l, k).targets[catId] || 0), 0);
  const takenOut = l.tx
    .filter((t) => t.cat === catId && ymOf(t.date) <= ym)
    .reduce((a, t) => a + t.amount, 0);
  return paidIn - takenOut;
}

/** Money that actually left this month, on real expenses. Pots are not spending. */
export function monthSpent(l: Ledger, ym: string): number {
  const known = new Set(l.cats.filter((c) => c.kind === 'saving').map((c) => c.id));
  return txOfMonth(l, ym)
    .filter((t) => !known.has(t.cat)) // a withdrawal is last month's money, not this month's
    .reduce((a, t) => a + t.amount, 0);
}

/** Money put away this month, which is gone from what you can spend. */
export function monthSaved(l: Ledger, ym: string): number {
  const b = monthBudget(l, ym);
  return l.cats
    .filter((c) => c.kind === 'saving')
    .reduce((a, c) => a + Math.max(0, b.targets[c.id] || 0), 0);
}

/** Everything the month takes out of the ceiling: spent plus saved. */
export const monthUsed = (l: Ledger, ym: string) => monthSpent(l, ym) + monthSaved(l, ym);

export function unsettled(l: Ledger, ym: string) {
  return txOfMonth(l, ym)
    .filter((t) => t.scope === 'split' && t.paidBy === 'me')
    .reduce((a, t) => a + Math.round((t.amount * (100 - t.pct)) / 100), 0);
}

/**
 * The last `n` months up to `ym`, oldest first, with what this category cost
 * each month. Pots report their running balance instead, because for a pot the
 * story is the total growing, not the monthly contribution.
 */
export function catHistory(l: Ledger, c: Category, ym: string, n = 6) {
  const out: Array<{ ym: string; value: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = shiftYm(ym, -i);
    const b = monthBudget(l, k);
    const value =
      c.kind === 'saving'
        ? potBalance(l, c.id, k)
        : used(c.kind, b.targets[c.id] || 0, spentBy(l, k, c.id));
    out.push({ ym: k, value });
  }
  return out;
}

/** Strips accents so searching "cafe" finds "café". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Searches every month, not just the one on screen. */
export function searchTx(l: Ledger, query: string): Tx[] {
  const q = fold(query.trim());
  if (!q) return [];
  const names = new Map(l.cats.map((c) => [c.id, fold(c.name)]));
  return l.tx.filter((t) => fold(t.note).includes(q) || (names.get(t.cat) || '').includes(q));
}

/** Shared expenses are off until asked for, but never hidden from someone using them. */
export const splitsOn = (l: Ledger) => l.splits ?? l.tx.some((t) => t.scope === 'split');
