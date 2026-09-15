import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountAge, accountTotals, parseAccountBalance, staleAccountCount } from '../accounts.ts';
import { dailyBudget, emptyLedger, makeCategory, potBalance } from '../data.ts';
import { migrate } from '../store.ts';
import { parseBackup, serialize, summarize } from '../backup.ts';
import { SCHEMA, type Ledger, type MoneyAccount } from '../types.ts';

const account = (id: string, balance: number, kind: MoneyAccount['kind'] = 'spending', reserved = 0): MoneyAccount => ({
  id, name: id, balance, kind, reserved, confirmedAt: '2026-09-10T12:00:00.000Z',
});
const ledger = (accounts: MoneyAccount[] = []): Ledger => ({ ...emptyLedger(), moneyAccounts: accounts });

test('accounts: aggregate four apps and separate money to spend from investments', () => {
  const l = ledger([account('Revolut', 80000), account('Cashback', 20000), account('Broker A', 300000, 'investment'), account('Broker B', 150000, 'investment')]);
  assert.deepEqual(accountTotals(l), { total: 550000, spending: 100000, saving: 0, invested: 450000, count: 4 });
});
test('accounts: money kept aside is part of the balance, not extra money', () => {
  const l = ledger([account('Revolut', 80000, 'spending', 30000), account('Emergency fund', 20000, 'saving')]);
  assert.deepEqual(accountTotals(l), { total: 100000, spending: 50000, saving: 50000, invested: 0, count: 2 });
});
test('accounts: hiding and restoring are reversible and change only the aggregate', () => {
  const l = ledger([account('Revolut', 80000), { ...account('Old app', 20000), archived: true }]);
  assert.equal(accountTotals(l).total, 80000);
  l.moneyAccounts![1].archived = false;
  assert.equal(accountTotals(l).total, 100000);
});
test('accounts: overdrafts reduce the total instead of being silently ignored', () => {
  assert.deepEqual(accountTotals(ledger([account('Bank', -5000), account('Cashback', 2000)])), { total: -3000, spending: -3000, saving: 0, invested: 0, count: 2 });
});
test('accounts: no accounts means no invented balance', () => {
  assert.equal(accountTotals(emptyLedger()).count, 0);
  assert.equal(accountTotals({ ...emptyLedger(), moneyAccounts: undefined }).total, 0);
});
test('accounts: budget pots are not added to physical balances or changed by them', () => {
  const pot = { ...makeCategory('Emergency', 'saving', 0, 0), id: 'pot' };
  const food = { ...makeCategory('Food', 'variable', 1, 1), id: 'food' };
  const l: Ledger = { ...ledger(), cats: [pot, food], months: { '2026-09': { ceiling: 100000, targets: { pot: 20000, food: 80000 } } } };
  const before = dailyBudget(l, '2026-09', new Date(2026, 8, 15));
  l.moneyAccounts = [account('Savings app', 20000, 'saving'), account('Cashback', 50000), account('Broker', 1000000, 'investment')];
  assert.equal(accountTotals(l).total, 1070000, 'the virtual pot is not a fourth balance');
  assert.equal(potBalance(l, pot, '2026-09'), 20000);
  assert.deepEqual(dailyBudget(l, '2026-09', new Date(2026, 8, 15)), before, 'snapshots never authorize extra daily spending');
  l.tx.push({ id: 'spent', cat: 'food', amount: 10000, date: '2026-09-15', note: '', scope: 'mine', pct: 100, paidBy: 'me', source: 'manual' });
  assert.equal(accountTotals(l).total, 1070000, 'manual snapshot does not claim automatic synchronization');
});
test('accounts: confirmation age uses calendar days and hidden accounts do not trigger reminders', () => {
  const a = account('Revolut', 100);
  assert.equal(accountAge(a, new Date(2026, 8, 10, 23)), 0);
  assert.equal(accountAge(a, new Date(2026, 8, 17, 8)), 7);
  assert.equal(staleAccountCount(ledger([a, { ...account('Hidden', 1), archived: true }]), new Date(2026, 8, 17)), 1);
});
test('accounts: signed balances support cents, reject invalid and nonfinite input', () => {
  assert.equal(parseAccountBalance('-20,50'), -2050);
  assert.equal(parseAccountBalance('−20.50'), -2050);
  assert.equal(parseAccountBalance('0'), 0);
  assert.equal(parseAccountBalance('0.29'), 29);
  for (const value of ['--2', '12.34.56', '1,000.00', 'Infinity', '9foo', '0.001', '']) assert.equal(parseAccountBalance(value), null, value);
});
test('accounts migration: v3 preserves every budget and expense and starts with no accounts', () => {
  const legacy: Ledger = { ...emptyLedger(), v: 3, moneyAccounts: undefined,
    months: { '2026-09': { ceiling: 100000, targets: { food: 50000 } } },
    tx: [{ id: 't1', cat: 'food', amount: 1234, date: '2026-09-10', note: 'Lunch', scope: 'mine', pct: 100, paidBy: 'me', source: 'manual' }],
  };
  const migrated = migrate(legacy)!;
  assert.equal(migrated.v, SCHEMA);
  assert.deepEqual(migrated.months, legacy.months);
  assert.deepEqual(migrated.tx, legacy.tx);
  assert.deepEqual(migrated.moneyAccounts, []);
  assert.deepEqual(migrate(migrated), migrated);
});
test('accounts backup: active and hidden balances round-trip with their confirmation dates', () => {
  const l = ledger([account('Revolut', 80000, 'spending', 20000), { ...account('Broker', 300000, 'investment'), archived: true }]);
  const result = parseBackup(serialize(l));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.ledger, l);
  assert.equal(summarize(l).accounts, 1);
});
test('accounts import: reject malformed snapshots and contradictory reserved balances', () => {
  const a = account('Revolut', 80000);
  const invalid = [null, 'accounts', [null], [a, a], [{ ...a, balance: '80000' }], [{ ...a, balance: 1.5 }], [{ ...a, reserved: 80001 }], [{ ...a, reserved: -1 }], [{ ...a, kind: 'credit' }], [{ ...a, name: '' }], [{ ...a, confirmedAt: '2026-02-30T12:00:00.000Z' }], [{ ...a, archived: 'yes' }], [{ ...a, kind: 'investment', balance: -1 }], [{ ...a, kind: 'saving', reserved: 100 }], [{ ...a, balance: -1, reserved: 100 }]];
  for (const moneyAccounts of invalid) {
    assert.equal(parseBackup(JSON.stringify({ ...emptyLedger(), moneyAccounts })).ok, false, JSON.stringify(moneyAccounts));
  }
});
