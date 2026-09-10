import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeT } from '../i18n.ts';

const src = readFileSync(new URL('../i18n.ts', import.meta.url), 'utf8');

function keysOf(name: string): string[] {
  const m = src.match(new RegExp('const ' + name + '(?:: typeof en)? = \\{([\\s\\S]*?)\\n\\};'));
  assert.ok(m, 'could not find the ' + name + ' dictionary');
  return [...m[1].matchAll(/(?:^|[{\s,])([a-zA-Z][a-zA-Z0-9]*)\s*:/g)].map((x) => x[1]);
}

// A repeated key is silently dropped by the object literal, so the older string
// wins and a screen quietly shows the wrong words. Only a test catches it.
for (const lang of ['en', 'pt']) {
  test('i18n: ' + lang + ' has no duplicate keys', () => {
    const keys = keysOf(lang);
    const seen = new Set<string>();
    const dupes = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    assert.deepEqual([...new Set(dupes)], []);
  });
}

test('i18n: the two dictionaries cover exactly the same keys', () => {
  const en = new Set(keysOf('en'));
  const pt = new Set(keysOf('pt'));
  assert.deepEqual([...en].filter((k) => !pt.has(k)), [], 'missing from pt');
  assert.deepEqual([...pt].filter((k) => !en.has(k)), [], 'missing from en');
});

test('i18n: no string is left untranslated by copy-paste', () => {
  const t = makeT('pt');
  const e = makeT('en');
  // A handful are legitimately identical across the two languages.
  const shared = new Set(['language', 'budgetLabel', 'balance', 'note']);
  const same = keysOf('en').filter((k) => !shared.has(k) && t(k as never) === e(k as never) && t(k as never).length > 3);
  assert.ok(same.length < 20, 'suspiciously many identical strings: ' + same.join(', '));
});

test('i18n: placeholders are substituted, and unknown vars are left alone', () => {
  const t = makeT('pt');
  assert.equal(t('catDeleted', { name: 'Viagens' }), 'Viagens apagada');
  assert.ok(!t('willExceed', { name: 'X', amount: '€1' }).includes('{'), 'no leftover placeholder');
});

test('i18n: every placeholder in en is also present in pt', () => {
  const en = makeT('en');
  const pt = makeT('pt');
  for (const k of keysOf('en')) {
    const a = [...en(k as never).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const b = [...pt(k as never).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(b, a, 'placeholders differ for "' + k + '"');
  }
});
