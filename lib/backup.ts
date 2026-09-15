'use client';

import { migrate } from './store';
import { SCHEMA, type Ledger } from './types';

export type Backup = { app: 'ledger'; schema: number; exportedAt: string; ledger: Ledger };
export type Summary = { accounts: number; cats: number; tx: number; months: number; from: string | null; to: string | null; workspace: string };

const FILE = 'application/json';

export function serialize(l: Ledger): string {
  const payload: Backup = { app: 'ledger', schema: SCHEMA, exportedAt: new Date().toISOString(), ledger: l };
  return JSON.stringify(payload, null, 2);
}

export function filename(l: Ledger, now = new Date()): string {
  const slug = (l.workspace || 'ledger').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ledger';
  return 'ledger-' + slug + '-' + now.toISOString().slice(0, 10) + '.json';
}

export function summarize(l: Ledger): Summary {
  const dates = l.tx.map((t) => t.date).sort();
  return {
    accounts: (l.moneyAccounts ?? []).filter(a => !a.archived).length,
    cats: l.cats.length,
    tx: l.tx.length,
    months: Object.keys(l.months).length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    workspace: l.workspace,
  };
}

/**
 * Accepts a wrapped backup or a bare ledger, and runs it through the same
 * migrations as stored data so an old export still imports. A file written by
 * a newer build is reported separately, because "not a backup" would be a lie.
 */
export function parseBackup(text: string): { ok: true; ledger: Ledger } | { ok: false; reason: 'invalid' | 'newer' } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'invalid' }; }

  let inner = raw;
  if (raw && typeof raw === 'object') {
    const outer = raw as Record<string, unknown>;
    if (typeof outer.schema === 'number' && outer.schema > SCHEMA) return { ok: false, reason: 'newer' };
    if (outer.ledger && typeof outer.ledger === 'object') inner = outer.ledger;
  }
  if (inner && typeof inner === 'object') {
    const v = (inner as Record<string, unknown>).v;
    if (typeof v === 'number' && v > SCHEMA) return { ok: false, reason: 'newer' };
  }

  const ledger = migrate(inner);
  return ledger ? { ok: true, ledger } : { ok: false, reason: 'invalid' };
}

/**
 * Hands the file to the phone. The share sheet is the only route that reaches
 * Files or iCloud on iOS, so it is tried first; the download attribute is the
 * desktop path, and the caller falls back to clipboard if both are refused.
 */
export async function saveBackup(l: Ledger): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const text = serialize(l);
  const name = filename(l);

  try {
    if (typeof File !== 'undefined' && navigator.share && navigator.canShare) {
      const file = new File([text], name, { type: FILE });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      }
    }
  } catch (e) {
    // A user-cancelled share sheet is not a failure worth falling through for.
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
  }

  try {
    const url = URL.createObjectURL(new Blob([text], { type: FILE }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  } catch {}

  return 'failed';
}

export async function copyBackup(l: Ledger): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(serialize(l));
    return true;
  } catch {
    return false;
  }
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('unreadable'));
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.readAsText(file);
  });
}
