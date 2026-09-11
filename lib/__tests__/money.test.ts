import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKS, STARTERS, catHistory, catState, makeCategory, monthFreed, monthSaved, monthSpent, monthUsed,
  monthsToGoal, monthsUpTo, potAt, potBalance, searchTx, shiftYm, splitsOn, unsettled, used, ymOf,
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

test('used: setting a target is allocation, not spending', () => {
  // Money planned for rent is still yours until the rent actually leaves.
  assert.equal(used('fixed', 80000, 0), 0);
  assert.equal(used('variable', 50000, 0), 0);
});

test('used: a fixed category costs what was actually paid', () => {
  assert.equal(used('fixed', 80000, 80000), 80000);
  assert.equal(used('fixed', 80000, 30000), 30000);
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

test('catState: a fixed bill fills up without ever "running hot"', () => {
  assert.equal(catState('fixed', 80000, 0), 'ok');
  assert.equal(catState('fixed', 80000, 70000), 'ok', 'no 80% warning on a bill meant to land on its number');
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

test('monthSpent: a budget you have not spent is not spending', () => {
  const l = ledger({
    cats: [cat('rent', 'fixed'), cat('food', 'variable')],
    months: { '2026-09': { ceiling: 200000, targets: { rent: 80000, food: 50000 } } },
    tx: [tx({ id: 'a', cat: 'food', amount: 1500, date: '2026-09-03' })],
  });
  // 130000 is allocated across the two categories, but only 1500 has left.
  assert.equal(monthSpent(l, '2026-09'), 1500);
  assert.equal(monthSaved(l, '2026-09'), 0);
  assert.equal(monthUsed(l, '2026-09'), 1500);
});

test('monthSaved: a pot contribution leaves the money you can spend', () => {
  const l = ledger({
    cats: [cat('emerg', 'saving'), cat('food', 'variable')],
    months: { '2026-09': { ceiling: 200000, targets: { emerg: 10000, food: 50000 } } },
    tx: [tx({ id: 'a', cat: 'food', amount: 1500, date: '2026-09-03' })],
  });
  assert.equal(monthSaved(l, '2026-09'), 10000);
  assert.equal(monthUsed(l, '2026-09'), 11500);
});

test('monthSpent: taking money out of a pot is not this month spending', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: { '2026-09': { ceiling: 200000, targets: { trip: 10000 } } },
    tx: [tx({ id: 'a', cat: 'trip', amount: 80000, date: '2026-09-10' })],
  });
  assert.equal(monthSpent(l, '2026-09'), 0, 'that 800 was charged to the months that saved it');
  assert.equal(monthUsed(l, '2026-09'), 10000);
});

test('monthSpent: expenses of a deleted category still count', () => {
  const l = ledger({
    cats: [],
    months: { '2026-09': { ceiling: 200000, targets: {} } },
    tx: [tx({ id: 'a', cat: 'gone', amount: 2500, date: '2026-09-04' })],
  });
  assert.equal(monthSpent(l, '2026-09'), 2500);
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
  assert.equal(potBalance(l, cat('emerg', 'saving'), '2026-09'), 30000);
  assert.equal(potBalance(l, cat('emerg', 'saving'), '2026-08'), 20000);
});

test('potBalance: months never opened still contribute, seeded from the last one set', () => {
  const l = ledger({
    cats: [cat('emerg', 'saving')],
    months: { '2026-07': { ceiling: 200000, targets: { emerg: 10000 } } },
  });
  // July, August and September, even though only July was ever written.
  assert.equal(potBalance(l, cat('emerg', 'saving'), '2026-09'), 30000);
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
  assert.equal(potBalance(l, cat('trip', 'saving'), '2026-08'), 8000);
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
  assert.equal(potBalance(l, cat('trip', 'saving'), '2026-07'), 10000);
});

test('potBalance: a pot created later is not credited for earlier months', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: {
      '2026-07': { ceiling: 0, targets: {} },
      '2026-09': { ceiling: 0, targets: { trip: 10000 } },
    },
  });
  assert.equal(potBalance(l, cat('trip', 'saving'), '2026-09'), 10000);
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

test('catHistory: returns n months, oldest first, ending on the month asked for', () => {
  const l = ledger({
    cats: [cat('food', 'variable')],
    months: { '2026-09': { ceiling: 0, targets: { food: 50000 } } },
    tx: [tx({ id: 'a', cat: 'food', amount: 3000, date: '2026-09-02' })],
  });
  const h = catHistory(l, cat('food', 'variable'), '2026-09', 3);
  assert.deepEqual(h.map((x) => x.ym), ['2026-07', '2026-08', '2026-09']);
  assert.equal(h[2].value, 3000);
  assert.equal(h[0].value, 0, 'a month before the budget existed cost nothing');
});

test('catHistory: a fixed category charts what was paid, not what was planned', () => {
  const l = ledger({
    cats: [cat('rent', 'fixed')],
    months: { '2026-08': { ceiling: 0, targets: { rent: 80000 } } },
    tx: [tx({ id: 'a', cat: 'rent', amount: 80000, date: '2026-08-02' })],
  });
  const h = catHistory(l, cat('rent', 'fixed'), '2026-09', 2);
  assert.deepEqual(h.map((x) => x.value), [80000, 0], 'September has not been paid yet');
});

test('catHistory: a pot reports its running balance, not the monthly amount', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: { '2026-07': { ceiling: 0, targets: { trip: 10000 } } },
  });
  assert.deepEqual(catHistory(l, cat('trip', 'saving'), '2026-09', 3).map((x) => x.value), [10000, 20000, 30000]);
});

test('search: ignores accents and case, in both directions', () => {
  const l = ledger({
    cats: [cat('food', 'variable')],
    tx: [
      tx({ id: 'a', cat: 'food', amount: 300, date: '2026-09-02', note: 'Café da manhã' }),
      tx({ id: 'b', cat: 'food', amount: 900, date: '2026-08-02', note: 'CAFE gelado' }),
      tx({ id: 'c', cat: 'food', amount: 500, date: '2026-07-02', note: 'Almoço' }),
    ],
  });
  assert.deepEqual(searchTx(l, 'cafe').map((x) => x.id), ['a', 'b']);
  assert.deepEqual(searchTx(l, 'CAFÉ').map((x) => x.id), ['a', 'b']);
  assert.deepEqual(searchTx(l, 'almoco').map((x) => x.id), ['c']);
});

test('search: reaches across months and matches the category name too', () => {
  const l = ledger({
    cats: [{ ...cat('food', 'variable'), name: 'Supermercado' }],
    tx: [
      tx({ id: 'a', cat: 'food', amount: 300, date: '2025-01-02', note: 'x' }),
      tx({ id: 'b', cat: 'other', amount: 900, date: '2026-09-02', note: 'y' }),
    ],
  });
  assert.deepEqual(searchTx(l, 'supermercado').map((x) => x.id), ['a'], 'an old month is still searchable');
});

test('search: an empty query matches nothing rather than everything', () => {
  const l = ledger({ tx: [tx({ id: 'a', cat: 'x', amount: 1, date: '2026-09-02', note: 'z' })] });
  assert.deepEqual(searchTx(l, ''), []);
  assert.deepEqual(searchTx(l, '   '), []);
});

test('splitsOn: off for a new ledger, on for anyone already splitting', () => {
  assert.equal(splitsOn(ledger()), false);
  assert.equal(
    splitsOn(ledger({ tx: [tx({ id: 'a', cat: 'x', amount: 1, date: '2026-09-01', scope: 'split', pct: 50 })] })),
    true,
    'existing split data must not vanish'
  );
});

test('splitsOn: an explicit choice always wins over the guess', () => {
  const withSplit = [tx({ id: 'a', cat: 'x', amount: 1, date: '2026-09-01', scope: 'split', pct: 50 })];
  assert.equal(splitsOn(ledger({ splits: false, tx: withSplit })), false);
  assert.equal(splitsOn(ledger({ splits: true })), true);
});

test('the pot cycle: save for four months, take it all out, start again', () => {
  const targets = { trip: 20000 };
  const months = Object.fromEntries(
    ['2026-06', '2026-07', '2026-08', '2026-09'].map((k) => [k, { ceiling: 200000, targets }])
  );
  const base = ledger({ cats: [cat('trip', 'saving'), cat('food', 'variable')], months });

  // Four months of putting 200 aside.
  assert.equal(potBalance(base, cat('trip', 'saving'), '2026-09'), 80000);

  const after = { ...base, tx: [tx({ id: 'w', cat: 'trip', amount: 80000, date: '2026-09-10' })] };
  assert.equal(potBalance(after, cat('trip', 'saving'), '2026-09'), 0, 'the pot is emptied');

  // The trip did not eat September: that money was charged to the months that saved it.
  assert.equal(monthSpent(after, '2026-09'), 0);
  assert.equal(monthSaved(after, '2026-09'), 20000, 'September still put its own 200 aside');

  // October keeps contributing, so the pot starts building again.
  assert.equal(potBalance(after, cat('trip', 'saving'), '2026-10'), 20000);
});

test('the pot cycle: an earlier month is unaffected by a later withdrawal', () => {
  const targets = { trip: 20000 };
  const months = Object.fromEntries(
    ['2026-06', '2026-07', '2026-08', '2026-09'].map((k) => [k, { ceiling: 200000, targets }])
  );
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months,
    tx: [tx({ id: 'w', cat: 'trip', amount: 80000, date: '2026-09-10' })],
  });
  assert.equal(potBalance(l, cat('trip', 'saving'), '2026-08'), 60000, 'August still had three months saved');
});

test('the pot cycle: taking out more than the pot holds goes negative rather than being hidden', () => {
  const l = ledger({
    cats: [cat('trip', 'saving')],
    months: { '2026-09': { ceiling: 0, targets: { trip: 10000 } } },
    tx: [tx({ id: 'w', cat: 'trip', amount: 30000, date: '2026-09-10' })],
  });
  assert.equal(potBalance(l, cat('trip', 'saving'), '2026-09'), -20000);
});

test('makeCategory: keeps the icon the user was shown', () => {
  // Onboarding previews each starter with its own mark; creating it must not
  // swap that for whatever the position in the list happens to map to.
  const c = makeCategory('Contas Fixas', 'fixed', 0, 0, 'bar');
  assert.equal(c.mark, 'bar');
  const second = makeCategory('Supermercado', 'variable', 1, 1, 'circle');
  assert.equal(second.mark, 'circle');
});

test('makeCategory: falls back to the position when no icon is given', () => {
  assert.equal(makeCategory('Nova', 'variable', 0, 0).mark, MARKS[0]);
  assert.equal(makeCategory('Outra', 'variable', 0, 3).mark, MARKS[3]);
});

test('makeCategory: every starter survives onboarding with its own icon', () => {
  for (const [i, s] of STARTERS.entries()) {
    assert.equal(makeCategory(s.pt, s.kind, s.ci, i, s.mark).mark, s.mark, s.key);
  }
});

const pot = (id: string, goal?: number) => ({ ...cat(id, 'saving' as const), ...(goal ? { goal } : {}) });
const everyMonth = (ks: string[], targets: Record<string, number>) =>
  Object.fromEntries(ks.map((k) => [k, { ceiling: 200000, targets }]));

test('goal: a pot with no goal keeps taking its contribution for ever', () => {
  const l = ledger({ months: everyMonth(['2026-07', '2026-08', '2026-09'], { p: 10000 }) });
  const s = potAt(l, pot('p'), '2026-09');
  assert.equal(s.balance, 30000);
  assert.equal(s.contribution, 10000);
  assert.equal(s.full, false);
  assert.equal(s.freed, 0);
});

test('goal: a pot stops contributing once it is full', () => {
  // 100 a month against a 250 goal: 100, 100, then only 50, then nothing.
  const l = ledger({ months: everyMonth(['2026-06', '2026-07', '2026-08', '2026-09'], { p: 10000 }) });
  const p = pot('p', 25000);
  assert.equal(potAt(l, p, '2026-07').balance, 20000);
  assert.equal(potAt(l, p, '2026-08').balance, 25000, 'the last month tops up by only what was missing');
  assert.equal(potAt(l, p, '2026-08').contribution, 5000);
  const now = potAt(l, p, '2026-09');
  assert.equal(now.balance, 25000, 'it does not overshoot the goal');
  assert.equal(now.contribution, 0);
  assert.equal(now.full, true);
});

test('goal: a full pot frees the money it would have taken', () => {
  const l = ledger({
    cats: [pot('p', 20000), cat('food', 'variable')],
    months: everyMonth(['2026-07', '2026-08', '2026-09'], { p: 10000, food: 40000 }),
  });
  assert.equal(monthSaved(l, '2026-09'), 0, 'the pot is full, so nothing is put away');
  assert.equal(monthFreed(l, '2026-09'), 10000, 'and its 100 is available for something else');
  assert.equal(monthSaved(l, '2026-07'), 10000, 'but it was still saving while filling');
  assert.equal(monthFreed(l, '2026-07'), 0);
});

test('goal: taking money out starts the pot filling again by itself', () => {
  const months = everyMonth(['2026-07', '2026-08', '2026-09', '2026-10'], { p: 10000 });
  const l = ledger({ months, tx: [tx({ id: 'w', cat: 'p', amount: 15000, date: '2026-09-10' })] });
  const p = pot('p', 20000);
  assert.equal(potAt(l, p, '2026-08').balance, 20000, 'full by August');
  const sep = potAt(l, p, '2026-09');
  assert.equal(sep.contribution, 0, 'still full at the start of September, so it took nothing');
  assert.equal(sep.balance, 5000, 'then 150 came out');
  const oct = potAt(l, p, '2026-10');
  assert.equal(oct.contribution, 10000, 'October resumes on its own');
  assert.equal(oct.balance, 15000);
  assert.equal(oct.full, false);
});

test('goal: a goal is never exceeded by contributions', () => {
  const l = ledger({ months: everyMonth(['2026-08', '2026-09'], { p: 50000 }) });
  assert.equal(potAt(l, pot('p', 30000), '2026-09').balance, 30000);
});

test('goal: a zero or missing goal means no cap', () => {
  const l = ledger({ months: everyMonth(['2026-08', '2026-09'], { p: 10000 }) });
  assert.equal(potAt(l, { ...cat('p', 'saving'), goal: 0 }, '2026-09').balance, 20000);
  assert.equal(potAt(l, cat('p', 'saving'), '2026-09').full, false);
});

test('monthsToGoal: counts the contributions still needed, rounding up', () => {
  const l = ledger({ months: everyMonth(['2026-09'], { p: 20000 }) });
  // 200 in, 1500 goal: 1300 to go at 200 a month is 7 more months.
  assert.equal(monthsToGoal(potAt(l, pot('p', 150000), '2026-09')), 7);
});

test('monthsToGoal: is nothing to say when there is no goal, or it is met', () => {
  const l = ledger({ months: everyMonth(['2026-09'], { p: 20000 }) });
  assert.equal(monthsToGoal(potAt(l, cat('p', 'saving'), '2026-09')), null);
  assert.equal(monthsToGoal(potAt(l, pot('p', 10000), '2026-09')), null, 'already met');
});

test('monthsToGoal: a pot that is not contributing has no arrival date', () => {
  const l = ledger({ months: everyMonth(['2026-09'], { p: 0 }) });
  assert.equal(monthsToGoal(potAt(l, pot('p', 100000), '2026-09')), null);
});

test('goal: the month a pot fills up, it still contributed', () => {
  // 200 a month, 1000 goal: September is the fifth month and completes it.
  const l = ledger({ months: everyMonth(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], { p: 20000 }) });
  const sep = potAt(l, pot('p', 100000), '2026-09');
  assert.equal(sep.balance, 100000);
  assert.equal(sep.full, true);
  assert.equal(sep.contribution, 20000, 'it filled up this month, so it did put money in');
  assert.equal(sep.freed, 0, 'nothing was freed yet');

  const oct = potAt(
    ledger({ months: everyMonth(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], { p: 20000 }) }),
    pot('p', 100000),
    '2026-10'
  );
  assert.equal(oct.contribution, 0, 'October is the first month it takes nothing');
  assert.equal(oct.freed, 20000);
});
