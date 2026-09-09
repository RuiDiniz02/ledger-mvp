import type { Category, CatState, Ledger, Tx } from './types';

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

export const MARKS = ['circle', 'ring', 'diamond', 'square', 'plus', 'stack', 'bar', 'dot'] as const;

export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

export function monthMeta(now = new Date()) {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  return {
    day,
    days,
    elapsed: day / days,
    daysLeft: Math.max(1, days - day + 1),
    key: iso(now).slice(0, 7),
    label: now.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' }),
  };
}

function dayOf(n: number, now = new Date()) {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return iso(new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(1, n), days)));
}

export function seed(now = new Date()): Ledger {
  const p = (i: number) => PALETTE[i];
  const cats: Category[] = [
    { id: 'bills', name: 'Fixed Bills', short: 'Bills', kind: 'fixed', budget: 125000, mark: 'bar', ...p(0) },
    { id: 'grocery', name: 'Groceries', short: 'Groceries', kind: 'variable', budget: 48000, mark: 'circle', ...p(1) },
    { id: 'dining', name: 'Dining & Leisure', short: 'Dining', kind: 'variable', budget: 30000, mark: 'ring', ...p(2) },
    { id: 'transport', name: 'Transport', short: 'Transport', kind: 'variable', budget: 14000, mark: 'diamond', ...p(3) },
    { id: 'invest', name: 'Investments', short: 'Invest', kind: 'fixed', budget: 60000, mark: 'stack', ...p(4) },
    { id: 'emerg', name: 'Emergency Fund', short: 'Emergency', kind: 'fixed', budget: 25000, mark: 'dot', ...p(5) },
    { id: 'health', name: 'Health', short: 'Health', kind: 'variable', budget: 8000, mark: 'plus', ...p(6) },
    { id: 'subs', name: 'Subscriptions', short: 'Subs', kind: 'fixed', budget: 10000, mark: 'square', ...p(7) },
  ];
  const rows: Array<[string, number, number, string, boolean]> = [
    ['bills', 95000, 1, 'Rent', true],
    ['bills', 13000, 3, 'Electricity + water', true],
    ['bills', 10000, 2, 'Fiber', true],
    ['invest', 60000, 1, 'Index fund DCA', false],
    ['emerg', 25000, 1, 'Auto-transfer', false],
    ['grocery', 6240, 2, 'Weekly shop', true],
    ['grocery', 4810, 5, 'Market', true],
    ['grocery', 3375, 6, 'Top-up', false],
    ['grocery', 6975, 8, 'Weekly shop', true],
    ['dining', 4000, 2, 'Cinema + drinks', true],
    ['dining', 2850, 3, 'Sushi', false],
    ['dining', 1240, 4, 'Lunch', false],
    ['dining', 9600, 5, 'Concert tickets', true],
    ['dining', 1860, 6, 'Bar', false],
    ['dining', 4200, 7, 'Brunch', true],
    ['dining', 7450, 9, 'Birthday dinner', true],
    ['transport', 2200, 2, 'Metro pass', false],
    ['transport', 1600, 6, 'Fuel', true],
    ['subs', 1099, 1, 'Music streaming', true],
    ['subs', 799, 1, 'Cloud storage', false],
    ['subs', 2499, 4, 'Training app', false],
  ];
  const today = now.getDate();
  const tx: Tx[] = rows
    .filter((r) => r[2] <= today)
    .map((r, i) => ({
      id: 'sx' + i,
      cat: r[0],
      amount: r[1],
      date: dayOf(r[2], now),
      note: r[3],
      scope: r[4] ? 'split' : 'mine',
      pct: r[4] ? 50 : 100,
      paidBy: 'me',
      source: 'manual',
    }));
  return { income: 410000, ceiling: 320000, cats, tx };
}

export const spentBy = (l: Ledger, catId: string) =>
  l.tx.filter((t) => t.cat === catId).reduce((a, t) => a + t.amount, 0);

export const totalSpent = (l: Ledger) => l.tx.reduce((a, t) => a + t.amount, 0);
export const allocated = (l: Ledger) => l.cats.reduce((a, c) => a + c.budget, 0);

/** Warning model: 80% (configurable) then 100%. Fixed categories read as funded, not overspent. */
export function catState(cat: Category, spent: number, warnAt = 80): CatState {
  const pct = cat.budget > 0 ? spent / cat.budget : 0;
  if (pct > 1) return 'over';
  if (cat.kind === 'fixed') return pct >= 0.995 ? 'funded' : 'ok';
  if (pct >= warnAt / 100) return 'near';
  return 'ok';
}

/** Amount owed to you by a partner across every split expense you paid. */
export function unsettled(l: Ledger) {
  return l.tx
    .filter((t) => t.scope === 'split' && t.paidBy === 'me')
    .reduce((a, t) => a + Math.round((t.amount * (100 - t.pct)) / 100), 0);
}
