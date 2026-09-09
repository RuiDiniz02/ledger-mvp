export type Kind = 'fixed' | 'variable';
export type Scope = 'mine' | 'split';
export type Source = 'manual' | 'bank' | 'recurring';

export interface Category {
  id: string;
  name: string;
  short: string;
  kind: Kind;
  /** monthly target, in minor units (cents) */
  budget: number;
  mark: MarkKind;
  c: string;
  cl: string;
  cd: string;
}

export type MarkKind = 'bar' | 'circle' | 'ring' | 'diamond' | 'stack' | 'dot' | 'plus' | 'square';

export interface Tx {
  id: string;
  cat: string;
  /** minor units (cents) — never floats */
  amount: number;
  /** ISO yyyy-mm-dd */
  date: string;
  note: string;
  scope: Scope;
  /** your share of the expense, 0-100. 100 when scope is 'mine'. */
  pct: number;
  /** who paid; single-member workspaces are always 'me' for now */
  paidBy: 'me' | 'partner';
  source: Source;
}

export interface Ledger {
  /** monthly net income, minor units */
  income: number;
  /** monthly spending ceiling, minor units */
  ceiling: number;
  cats: Category[];
  tx: Tx[];
}

export type CatState = 'ok' | 'near' | 'over' | 'funded';
