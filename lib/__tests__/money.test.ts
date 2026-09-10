import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catState, monthUsed, monthsUpTo, potBalance, shiftYm, unsettled, used, ymOf,
} from '../data.ts';
import { money } from '../format.ts';
import type { Kind, Ledger, Tx } from '../types.ts';

const tx = (over: Partial<Tx> & Pick<Tx, 'id' | 'cat' | 'amount' | 'date'>): Tx => ({
  note: '', scope: 'mine', pct: 100, paidBy: 'me', source: 'manual', ...over,
});

const ledger = (over: Partial<Ledger> = {}): Ledger => ({
  v: 3, workspace: 'T', lang: 'en', onboarded: true, cats: [], months: {}, tx: [], ...over,
});

const cat = (id: string, kind: Kind) => ({ id, name: id, kind, mark: 'dot' as const, c: '#000', cl: '#111', cd: '#222' });

test('used: a variable category costs only what was logged', () => {
  assert.equal(used('variable', 50000, 12300), 12300);
  assert.equal(used('variable', 50000, 0), 0);
});

test('used: a fixed category costs its target even before it is logged', () => {
  assert.equal(used('fixed', 80000, 0), 80000);
});

test('used: logging a fixed category does not charge it twice', () => {
  assert.equal(used('fixed', 80000, 80000), 80000);
  assert.equal(used('fixed', 80000, 30000), 80000);
});

test('used: a fixed category that cost more than planned counts the larger sum', () => {
  assert.equal(used('fixed', 80000, 85000), 85000);
});

test('used: a pot costs the month its contribution, never the withdrawal', () => {
  // Took 800 out of the travel pot this month; the month still only owes the 100 contribution.
  assert.equal(used('saving', 10000, 80000), 10000);
  assert.equal(used('saving', 0, 80000), 0);
});

test('catState: a pot never warns', () => {
  assert.equal(catState('saving', 10000, 0), 'funded');
  assert.equal(catState('saving', 10000, 999999), 'funded');
});

test('catState: a commitment reads funded, and over only when it cost more', () => {
  assert.equal(catState('fixed', 80000, 0), 'funded');
  assert.equal(catState('fixed', 80000, 80000), 'funded');
  assert.equal(catState('fixed', 80000, 80001), 'over');
});

test('catState: a variable category warns at 80 then over at 100', () => {
  assert.equal(catState('variable', 10000, 7999), 'ok');
  assert.equal(catState('variable', 10000, 8000), 'near');
  assert.equal(catState('variable', 10000, 10000), 'near');
  assert.equal(catState('variable', 10000, 10001), 'over');
});

test('catState: spending with no target set is flagged, not silently ok', () => {
  assert.equal(catState('variable', 0, 500), 'empty');
  assert.equal(catState('variable', 0, 0), 'ok');
});

test('monthUsed: commitments count from the 1st, so remaining is honest', () => {
  const l = ledger({
    cats: [cat('rent', 'fixed'), cat('food', 'variable')],
    months: { '2026-09': { ceiling: 200000, targets: { rent: 80000, food: 50000 } } },
    tx: [tx({ id: 'a', cat: 'food', amount: 1500, date: '2026-09-03' })],
  });
  // Nothing logged for rent, but it is still owed.
  assert.equal(monthUsed(l, '2026-09'), 80000 + 1500);
});

test('monthUsed: a pot withdrawal does not blow up the month', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: { '2026-09': { ceiling: 200000, targets: { trip: 10000 } } },
    tx: [tx({ id: 'a', cat: 'trip', amount: 80000, date: '2026-09-10' })],
  });
  assert.equal(monthUsed(l, '2026-09'), 10000);
});

test('monthUsed: expenses of a deleted category still count', () => {
  const l = ledger({
    cats: [],
    months: { '2026-09': { ceiling: 200000, targets: {} } },
    tx: [tx({ id: 'a', cat: 'gone', amount: 2500, date: '2026-09-04' })],
  });
  assert.equal(monthUsed(l, '2026-09'), 2500);
});

test('potBalance: contributions accumulate across months', () => {
  const l = ledger({
    cats: [cat('emerg', 'saving')],
    months: {
      '2026-07': { ceiling: 200000, targets: { emerg: 10000 } },
      '2026-08': { ceiling: 200000, targets: { emerg: 10000 } },
      '2026-09': { ceiling: 200000, targets: { emerg: 10000 } },
    },
  });
  assert.equal(potBalance(l, 'emerg', '2026-09'), 30000);
  assert.equal(potBalance(l, 'emerg', '2026-08'), 20000);
});

test('potBalance: months never opened still contribute, seeded from the last one set', () => {
  const l = ledger({
    cats: [cat('emerg', 'saving')],
    months: { '2026-07': { ceiling: 200000, targets: { emerg: 10000 } } },
  });
  // July, August and September, even though only July was ever written.
  assert.equal(potBalance(l, 'emerg', '2026-09'), 30000);
});

test('potBalance: taking money out lowers the balance', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: {
      '2026-07': { ceiling: 200000, targets: { trip: 10000 } },
      '2026-08': { ceiling: 200000, targets: { trip: 10000 } },
    },
    tx: [tx({ id: 'a', cat: 'trip', amount: 12000, date: '2026-08-20' })],
  });
  assert.equal(potBalance(l, 'trip', '2026-08'), 8000);
});

test('potBalance: a withdrawal in a later month does not affect an earlier balance', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: {
      '2026-07': { ceiling: 0, targets: { trip: 10000 } },
      '2026-08': { ceiling: 0, targets: { trip: 10000 } },
    },
    tx: [tx({ id: 'a', cat: 'trip', amount: 5000, date: '2026-08-20' })],
  });
  assert.equal(potBalance(l, 'trip', '2026-07'), 10000);
});

test('potBalance: a pot created later is not credited for earlier months', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: {
      '2026-07': { ceiling: 0, targets: {} },
      '2026-09': { ceiling: 0, targets: { trip: 10000 } },
    },
  });
  assert.equal(potBalance(l, 'trip', '2026-09'), 10000);
});

test('monthsUpTo: is inclusive and ordered, and capped against runaway data', () => {
  const l = ledger({ months: { '2026-07': { ceiling: 0, targets: {} } } });
  assert.deepEqual(monthsUpTo(l, '2026-09'), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(monthsUpTo(l, '2026-07'), ['2026-07']);
  assert.equal(monthsUpTo(l, '2026-06').length, 1, 'a month before any record is just itself');
  assert.equal(monthsUpTo(ledger({ months: { '1900-01': { ceiling: 0, targets: {} } } }), '2026-09', 12).length, 12);
});

test('shiftYm crosses year boundaries in both directions', () => {
  assert.equal(shiftYm('2026-12', 1), '2027-01');
  assert.equal(shiftYm('2026-01', -1), '2025-12');
  assert.equal(shiftYm('2026-09', 0), '2026-09');
});

test('ymOf reads the month straight off the stored date', () => {
  assert.equal(ymOf('2026-09-01'), '2026-09');
  assert.equal(ymOf('2026-12-31'), '2026-12');
});

test('unsettled: only your share of a split is owed back to you', () => {
  const l = ledger({
    tx: [
      tx({ id: 'a', cat: 'x', amount: 10000, date: '2026-09-02', scope: 'split', pct: 50 }),
      tx({ id: 'b', cat: 'x', amount: 3000, date: '2026-09-03' }),
      tx({ id: 'c', cat: 'x', amount: 10000, date: '2026-08-02', scope: 'split', pct: 50 }),
    ],
  });
  assert.equal(unsettled(l, '2026-09'), 5000);
});

test('money: rounds to cents and never renders a stray minus on zero', () => {
  assert.equal(money(0), '€0.00');
  assert.equal(money(1250), '€12.50');
  assert.equal(money(-1250).startsWith('−'), true);
});
