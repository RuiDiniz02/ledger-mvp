/**
 * How a category behaves across months.
 * - `variable`: spending that changes. Resets monthly, warns as it fills.
 * - `fixed`: a known commitment. Counted against the month whether or not
 *   you log it, because you owe it either way.
 * - `saving`: a pot. The target is a monthly contribution that accumulates;
 *   logging an expense takes money back out of the pot.
 */
export type Kind = 'fixed' | 'variable' | 'saving';
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
  /**
   * Optional, and only meaningful for a `saving` pot: the amount it is building
   * towards. Once the balance reaches it the pot stops taking its monthly
   * contribution, which frees that money up for something else.
   */
  goal?: number;
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

/** Where money added to a month on top of the plan came from. */
export type ExtraSource = 'carry' | 'freed' | 'outside';

/**
 * Money handed to this month beyond its ceiling. Kept as a list rather than
 * folded into `ceiling` and `targets`, so the plan stays readable and the app
 * can always say where a sum came from.
 */
export interface Extra {
  id: string;
  from: ExtraSource;
  /**
   * The category it was given to. Always a real one: money parked on the month
   * at large would lift the ceiling without sitting in any budget, so it could
   * never be spent or carried forward. Undecided money stays in the pool.
   * `null` is tolerated only for rows written before that was settled.
   */
  to: string | null;
  amount: number;
}

/** Budgets are per calendar month, keyed yyyy-mm. */
export interface MonthBudget {
  ceiling: number;
  targets: Record<string, number>;
  extra?: Extra[];
  /**
   * Money brought in from outside the app — savings that already existed before
   * any of this was tracked. It lands in the pool rather than in a budget, so
   * it goes through the same hand-out as anything else.
   */
  added?: number;
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
  /**
   * Whether the shared-expense controls are shown. Undefined means "decide from
   * the data", so anyone already splitting keeps seeing them.
   */
  splits?: boolean;
}

export type CatState = 'ok' | 'near' | 'over' | 'funded' | 'empty';
