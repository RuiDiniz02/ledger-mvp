'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Ledger } from './types';
import { emptyLedger } from './data';

const KEY = 'ledger.mvp.v2';

/**
 * One workspace per browser. Swap this hook for TanStack Query calls against
 * /api/* when accounts land — the component tree does not change.
 */
export function useLedger() {
  const [data, setData] = useState<Ledger | null>(null);

  useEffect(() => {
    let next: Ledger | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.v === 2 && Array.isArray(p.cats)) next = p;
      }
    } catch {}
    setData(next ?? emptyLedger());
  }, []);

  const update = useCallback((fn: (draft: Ledger) => void) => {
    setData((prev) => {
      if (!prev) return prev;
      const draft: Ledger = JSON.parse(JSON.stringify(prev));
      fn(draft);
      try { window.localStorage.setItem(KEY, JSON.stringify(draft)); } catch {}
      return draft;
    });
  }, []);

  const reset = useCallback(() => {
    try { window.localStorage.removeItem(KEY); } catch {}
    setData(emptyLedger());
  }, []);

  return { data, update, reset };
}
