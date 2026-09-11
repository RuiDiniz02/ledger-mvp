import { SCHEMA, type Category, type CatState, type Extra, type ExtraSource, type Kind, type Ledger, type MarkKind, type MonthBudget, type Tx } from './types';

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

/**
 * `mark` is the icon. Pass it to keep the one the user saw; leaving it out falls
 * back to the position in the list, which is only sensible for a brand new
 * category with nothing to preview.
 */
export function makeCategory(name: string, kind: Kind, ci: number, index: number, mark?: MarkKind): Category {
  return { id: uid('c'), name, kind, mark: mark ?? MARKS[index % MARKS.length], ...PALETTE[ci % PALETTE.length] };
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

export type PotState = {
  /** What is in the pot at the end of `ym`. */
  balance: number;
  /** What it actually took this month, which a goal can cut to zero. */
  contribution: number;
  /** What the plan said it would take, before the goal capped it. */
  planned: number;
  /** Money the goal freed up this month. */
  freed: number;
  full: boolean;
  goal: number | null;
};

/**
 * Walks a pot month by month, because a goal makes each month depend on the
 * one before it: once the balance reaches the goal the pot stops taking its
 * contribution, and it starts again by itself if money is taken out.
 *
 * Within a month the pot is topped up first and spent from second, so a
 * withdrawal never blocks that month's own contribution.
 */
export function potAt(l: Ledger, cat: Category, ym: string): PotState {
  const goal = cat.goal && cat.goal > 0 ? cat.goal : null;

  const out: Record<string, number> = {};
  for (const t of l.tx) {
    if (t.cat === cat.id) out[ymOf(t.date)] = (out[ymOf(t.date)] || 0) + t.amount;
  }

  let balance = 0;
  let contribution = 0;
  let planned = 0;
  for (const k of monthsUpTo(l, ym)) {
    const target = targetIn(l, k, cat.id);
    const room = goal === null ? target : Math.max(0, Math.min(target, goal - balance));
    balance += room - (out[k] || 0);
    if (k === ym) { contribution = room; planned = target; }
  }

  return { balance, contribution, planned, freed: Math.max(0, planned - contribution), full: goal !== null && balance >= goal, goal };
}

/** A pot's balance as of the end of `ym`. */
export const potBalance = (l: Ledger, cat: Category, ym: string) => potAt(l, cat, ym).balance;

/** How many more months of contributions before the goal is met. */
export function monthsToGoal(p: PotState): number | null {
  if (p.goal === null || p.balance >= p.goal || p.planned <= 0) return null;
  return Math.ceil((p.goal - p.balance) / p.planned);
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
  return l.cats
    .filter((c) => c.kind === 'saving')
    .reduce((a, c) => a + potAt(l, c, ym).contribution, 0);
}

/** Contributions a full pot released this month, ready to go somewhere else. */
export function monthFreed(l: Ledger, ym: string): number {
  return l.cats
    .filter((c) => c.kind === 'saving')
    .reduce((a, c) => a + potAt(l, c, ym).freed, 0);
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
        ? potBalance(l, c, k)
        : used(c.kind, targetIn(l, k, c.id), spentBy(l, k, c.id));
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


/** Extra money given to one category in a month, or to the month at large. */
export function extraFor(l: Ledger, ym: string, to: string | null): number {
  const b = l.months[ym];
  if (!b || !b.extra) return 0;
  return b.extra.filter((e) => e.to === to).reduce((a, e) => a + e.amount, 0);
}

/** Money brought in from outside in a month, before it is handed out. */
export function addedIn(l: Ledger, ym: string): number {
  const b = l.months[ym];
  return b && typeof b.added === 'number' ? Math.max(0, b.added) : 0;
}

/** Everything handed out in a month, wherever it went. */
export function distributed(l: Ledger, ym: string): number {
  const b = l.months[ym];
  return b && b.extra ? b.extra.reduce((a, e) => a + e.amount, 0) : 0;
}

/** A category's budget for a month: what was planned, plus anything given to it. */
export function targetIn(l: Ledger, ym: string, catId: string): number {
  return Math.max(0, monthBudget(l, ym).targets[catId] || 0) + extraFor(l, ym, catId);
}

/** The month's ceiling, plus everything handed to it from outside the plan. */
export function ceilingIn(l: Ledger, ym: string): number {
  return monthBudget(l, ym).ceiling + distributed(l, ym);
}

/**
 * What a finished month left behind: the net across variable categories only.
 *
 * Money still sitting in a fixed category is not a saving, it is a bill that
 * has not been paid yet, and carrying it would hand over money you still need.
 * Unallocated ceiling is not carried either — the ceiling is a limit, not cash.
 */
export function leftoverOf(l: Ledger, ym: string): number {
  if (!monthsUpTo(l, ym).length) return 0;
  const net = l.cats
    .filter((c) => c.kind === 'variable')
    .reduce((a, c) => a + (targetIn(l, ym, c.id) - spentBy(l, ym, c.id)), 0);
  return Math.max(0, net);
}

/**
 * Money waiting to be given a home, as of the end of `ym`. It builds up from
 * what each finished month left over and what full pots released, less whatever
 * has already been handed out. Nothing expires: skip a month and it is still here.
 */
export function poolAt(l: Ledger, ym: string): number {
  let pool = 0;
  for (const k of monthsUpTo(l, ym)) {
    pool += leftoverOf(l, shiftYm(k, -1));
    pool += monthFreed(l, k);
    pool += addedIn(l, k);
    pool -= distributed(l, k);
  }
  return Math.max(0, pool);
}

/** Where this month's pool came from, for the line under the prompt. */
export function poolSources(l: Ledger, ym: string) {
  return { carried: leftoverOf(l, shiftYm(ym, -1)), freed: monthFreed(l, ym), added: addedIn(l, ym) };
}

export function makeExtra(from: ExtraSource, to: string | null, amount: number): Extra {
  return { id: uid('e'), from, to, amount };
}
