'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SCHEMA, type Ledger } from './types';
import { emptyLedger } from './data';
import { validLedger } from './validation';

const KEY = 'ledger.mvp.v2';
/** Anything we could not read is parked here rather than thrown away. */
const QUARANTINE = 'ledger.mvp.unreadable';

export type StorageInfo = { persisted: boolean; usedKb: number | null; standalone: boolean };

/**
 * Forward-only migrations, one per schema bump. A ledger saved by an older
 * build is upgraded on load — never discarded, because for most people this
 * browser holds the only copy of their history.
 */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // v2 had no lastExport and allowed tx rows without paidBy/source.
  2: (d) => {
    const tx = Array.isArray(d.tx) ? d.tx : [];
    return {
      ...d,
      tx: tx.map((r) => {
        if (!r || typeof r !== 'object') return r;
        const row = r as Record<string, unknown>;
        return {
          ...row,
          scope: row.scope === 'split' ? 'split' : 'mine',
          pct: typeof row.pct === 'number' ? row.pct : 100,
          paidBy: row.paidBy === 'partner' ? 'partner' : 'me',
          source: row.source === 'bank' || row.source === 'recurring' ? row.source : 'manual',
        };
      }),
      v: 3,
    };
  },
};

/** Coerces anything plausibly ledger-shaped into the current schema, or returns null. */
export function migrate(input: unknown): Ledger | null {
  if (!input || typeof input !== 'object') return null;
  let d = { ...(input as Record<string, unknown>) };
  if (!Array.isArray(d.cats) || !Array.isArray(d.tx) || typeof d.months !== 'object' || d.months === null) return null;

  let v = typeof d.v === 'number' ? d.v : 2;
  if (!Number.isInteger(v) || v < 0 || v > SCHEMA) return null; // written by a newer build; refuse rather than corrupt it
  while (v < SCHEMA) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    d = step(d);
    const next = typeof d.v === 'number' ? d.v : v + 1;
    if (next <= v) return null; // a migration that does not advance would loop
    v = next;
  }

  if (!validLedger(d)) return null;
  const base = emptyLedger();
  return {
    ...base,
    ...d,
    v: SCHEMA,
    lang: d.lang === 'pt' ? 'pt' : 'en',
    workspace: typeof d.workspace === 'string' ? d.workspace : base.workspace,
    onboarded: d.onboarded === true,
  } as Ledger;
}

/**
 * One workspace per device. Swap this hook for TanStack Query calls against
 * /api/* when accounts land — the component tree does not change.
 */
export function useLedger() {
  const [data, setData] = useState<Ledger | null>(null);
  const [storage, setStorage] = useState<StorageInfo>({ persisted: false, usedKb: null, standalone: false });
  const [storageError, setStorageError] = useState(false);
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const writable = useRef(true);
  const pending = useRef<Ledger | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const next = pending.current;
    if (!next) return;
    if (!writable.current) { setStorageError(true); return; }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      pending.current = null;
      setStorageError(false);
    } catch { setStorageError(true); }
  }, []);

  useEffect(() => {
    let next: Ledger | null = null;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(KEY);
      if (raw) {
        try { next = migrate(JSON.parse(raw)); } catch { next = null; }
        if (!next) {
          // Preserve every unreadable payload, including invalid JSON, before allowing writes.
          const key = window.localStorage.getItem(QUARANTINE) ? QUARANTINE + '.' + Date.now() : QUARANTINE;
          window.localStorage.setItem(key, raw);
          setRecoveryNeeded(true);
        }
      }
    } catch {
      writable.current = false;
      setStorageError(true);
      if (raw) setRecoveryNeeded(true);
    }
    setData(next ?? emptyLedger());
  }, []);

  // Ask the browser not to evict us. Without this, mobile Safari can clear
  // script-writable storage for a site that has not been opened in a while.
  useEffect(() => {
    let alive = true;
    const read = async () => {
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      let persisted = false;
      let usedKb: number | null = null;
      try {
        if (navigator.storage?.persisted) {
          persisted = await navigator.storage.persisted();
          if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
        }
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          if (typeof est.usage === 'number') usedKb = Math.max(1, Math.round(est.usage / 1024));
        }
      } catch {}
      if (alive) setStorage({ persisted, usedKb, standalone });
    };
    read();
    return () => { alive = false; };
  }, []);

  // Writes are coalesced so dragging a target slider does not hammer
  // localStorage, then forced out before the page can be discarded.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      flush();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  const update = useCallback((fn: (draft: Ledger) => void) => {
    setData((prev) => {
      if (!prev) return prev;
      const draft: Ledger = JSON.parse(JSON.stringify(prev));
      fn(draft);
      pending.current = draft;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, 150);
      return draft;
    });
  }, [flush]);

  /** Replaces the whole ledger — used by Import, which has already validated it. */
  const replace = useCallback((next: Ledger) => {
    pending.current = next;
    flush();
    setData(next);
  }, [flush]);

  const reset = useCallback(() => {
    pending.current = null;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    try { window.localStorage.removeItem(KEY); } catch {}
    setData(emptyLedger());
  }, []);

  return { data, update, replace, reset, storage, storageError, recoveryNeeded };
}
