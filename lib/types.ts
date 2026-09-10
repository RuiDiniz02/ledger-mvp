export type Kind = 'fixed' | 'variable';
export type Scope = 'mine' | 'split';
export type Source = 'manual' | 'bank' | 'recurring';
export type Lang = 'en' | 'pt';
export type MarkKind = 'bar' | 'circle' | 'ring' | 'diamond' | 'stack' | 'dot' | 'plus' | 'square';

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  mark: MarkKind;
  c: string;
  cl: string;
  cd: string;
  archived?: boolean;
}

export interface Tx {
  id: string;
  cat: string;
  /** minor units (cents) — never floats */
  amount: number;
  /** ISO yyyy-mm-dd */
  date: string;
  note: string;
  scope: Scope;
  /** your share, 0-100. 100 when scope is 'mine'. */
  pct: number;
  paidBy: 'me' | 'partner';
  source: Source;
}

/** Budgets are per calendar month, keyed yyyy-mm. */
export interface MonthBudget {
  ceiling: number;
  targets: Record<string, number>;
}

/** Bump on every shape change and add a step to MIGRATIONS in lib/store.ts. */
export const SCHEMA = 3;

export interface Ledger {
  v: number;
  workspace: string;
  lang: Lang;
  onboarded: boolean;
  cats: Category[];
  months: Record<string, MonthBudget>;
  tx: Tx[];
  /** ISO timestamp of the last backup the user exported, for the reminder in Account. */
  lastExport?: string;
}

export type CatState = 'ok' | 'near' | 'over' | 'funded' | 'empty';
