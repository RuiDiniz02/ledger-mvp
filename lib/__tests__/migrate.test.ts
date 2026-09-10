import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../store.ts';
import { parseBackup, serialize, summarize, filename } from '../backup.ts';
import { SCHEMA, type Ledger } from '../types.ts';

const v2 = () => ({
  v: 2, workspace: 'Rui', lang: 'pt', onboarded: true,
  cats: [{ id: 'c1', name: 'Renda', kind: 'fixed', mark: 'bar', c: '#000', cl: '#111', cd: '#222' }],
  months: { '2026-09': { ceiling: 150000, targets: { c1: 80000 } } },
  // A row from the earliest build, missing paidBy and source.
  tx: [{ id: 't1', cat: 'c1', amount: 80000, date: '2026-09-02', note: 'Renda', scope: 'mine', pct: 100 }],
});

test('migrate: a v2 ledger is upgraded, never discarded', () => {
  const out = migrate(v2());
  assert.ok(out, 'v2 data must survive');
  assert.equal(out.v, SCHEMA);
  assert.equal(out.workspace, 'Rui');
  assert.equal(out.tx.length, 1);
});

test('migrate: missing provenance is backfilled rather than left undefined', () => {
  const out = migrate(v2())!;
  assert.equal(out.tx[0].paidBy, 'me');
  assert.equal(out.tx[0].source, 'manual');
  assert.equal(out.tx[0].amount, 80000, 'amounts must not be touched');
});

test('migrate: money and dates are carried across untouched', () => {
  const out = migrate(v2())!;
  assert.equal(out.months['2026-09'].ceiling, 150000);
  assert.equal(out.months['2026-09'].targets.c1, 80000);
  assert.equal(out.tx[0].date, '2026-09-02');
});

test('migrate: a ledger already at the current schema passes through', () => {
  const once = migrate(v2())!;
  const twice = migrate(JSON.parse(JSON.stringify(once)))!;
  assert.deepEqual(twice, once, 'migrating twice must be a no-op');
});

test('migrate: rubbish is refused instead of being half-loaded', () => {
  assert.equal(migrate(null), null);
  assert.equal(migrate('nope'), null);
  assert.equal(migrate({}), null);
  assert.equal(migrate({ v: 2, cats: [] }), null, 'missing tx and months');
  assert.equal(migrate({ v: 2, cats: {}, tx: [], months: {} }), null, 'cats must be an array');
});

test('migrate: a ledger from a newer build is refused, not silently downgraded', () => {
  assert.equal(migrate({ ...v2(), v: SCHEMA + 1 }), null);
});

test('migrate: an unknown language falls back rather than sticking', () => {
  const out = migrate({ ...v2(), lang: 'klingon' })!;
  assert.equal(out.lang, 'en');
});

test('migrate: onboarded is only ever true when it was truly true', () => {
  assert.equal(migrate({ ...v2(), onboarded: 'yes' })!.onboarded, false);
  assert.equal(migrate({ ...v2(), onboarded: true })!.onboarded, true);
});

test('backup: export and import round-trip without losing anything', () => {
  const original = migrate(v2())!;
  const parsed = parseBackup(serialize(original));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.ledger, original);
});

test('backup: an old bare v2 export still restores', () => {
  const parsed = parseBackup(JSON.stringify(v2()));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.ledger.v, SCHEMA);
});

test('backup: a file from a newer build says so instead of "not a backup"', () => {
  const parsed = parseBackup(JSON.stringify({ app: 'ledger', schema: SCHEMA + 5, ledger: v2() }));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, 'newer');
});

test('backup: junk is rejected as invalid', () => {
  for (const bad of ['', '}{', 'null', '[1,2,3]', '{"hello":true}']) {
    const parsed = parseBackup(bad);
    assert.equal(parsed.ok, false, bad);
    if (!parsed.ok) assert.equal(parsed.reason, 'invalid', bad);
  }
});

test('backup: the summary counts what is really in the file', () => {
  const s = summarize(migrate(v2())!);
  assert.deepEqual(
    { cats: s.cats, tx: s.tx, months: s.months, from: s.from, to: s.to },
    { cats: 1, tx: 1, months: 1, from: '2026-09-02', to: '2026-09-02' }
  );
});

test('backup: the filename is safe for a filesystem', () => {
  const l = migrate(v2())! as Ledger;
  assert.match(filename({ ...l, workspace: 'Rui / Casa!! ' }, new Date('2026-09-10T00:00:00Z')), /^ledger-rui-casa-2026-09-10\.json$/);
  assert.match(filename({ ...l, workspace: '' }, new Date('2026-09-10T00:00:00Z')), /^ledger-ledger-2026-09-10\.json$/);
});
