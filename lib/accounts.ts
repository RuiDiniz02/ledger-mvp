import { parseMoney } from './format';
import type { Ledger, MoneyAccount } from './types';

export const activeAccounts = (l: Ledger) => (l.moneyAccounts ?? []).filter(a => !a.archived);

/** Only confirmed account balances enter this total. Never add budget pots. */
export function accountTotals(l: Ledger) {
  const accounts = activeAccounts(l);
  let spending = 0, saving = 0, invested = 0;
  for (const a of accounts) {
    if (a.kind === 'spending') { spending += a.balance - a.reserved; saving += a.reserved; }
    else if (a.kind === 'saving') saving += a.balance;
    else invested += a.balance;
  }
  return { total: spending + saving + invested, spending, saving, invested, count: accounts.length };
}

/** Calendar dates, not elapsed hours, so a balance ages consistently across DST. */
export function accountAge(account: MoneyAccount, now = new Date()): number {
  const confirmed = new Date(account.confirmedAt);
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(now) - day(confirmed)) / 86400000));
}

export const staleAccountCount = (l: Ledger, now = new Date()) => activeAccounts(l).filter(a => accountAge(a, now) >= 7).length;

/** Negative checking balances must reduce the total rather than vanish. */
export function parseAccountBalance(value: string): number | null {
  const normalized = value.trim().replace('−', '-');
  const negative = normalized.startsWith('-');
  const amount = parseMoney(negative ? normalized.slice(1) : normalized);
  return amount === null ? null : (negative ? -amount : amount) || 0;
}

export function validMoneyAccounts(value: unknown): value is MoneyAccount[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  const ids = new Set<string>();
  return value.every(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const a = raw as Record<string, unknown>;
    if (typeof a.id !== 'string' || !a.id || ['__proto__', 'constructor', 'prototype'].includes(a.id) || ids.has(a.id)) return false;
    ids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 60) return false;
    if (!['spending', 'saving', 'investment'].includes(String(a.kind))) return false;
    if (!Number.isSafeInteger(a.balance) || Math.abs(Number(a.balance)) > 99999999999) return false;
    if (a.kind !== 'spending' && Number(a.balance) < 0) return false;
    if (!Number.isSafeInteger(a.reserved) || Number(a.reserved) < 0 || Number(a.reserved) > Math.max(0, Number(a.balance))) return false;
    if (a.kind !== 'spending' && a.reserved !== 0) return false;
    if (typeof a.confirmedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(a.confirmedAt) || !Number.isFinite(Date.parse(a.confirmedAt)) || new Date(a.confirmedAt).toISOString() !== a.confirmedAt) return false;
    return a.archived === undefined || typeof a.archived === 'boolean';
  });
}
