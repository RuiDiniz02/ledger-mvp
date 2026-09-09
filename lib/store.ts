'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Ledger } from './types';
import { seed } from './data';

const KEY = 'ledger.mvp.v1';

/**
 * Client-side persistence for the MVP. Swap this hook for TanStack Query calls
 * against /api/* when the Postgres ledger lands — the component tree does not change.
 */
export function useLedger() {
  const [data, setData] = useState<Ledger | null>(null);

  useEffect(() => {
    let next: Ledger | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.cats) && Array.isArray(parsed.tx)) next = parsed;
      }
    } catch {}
    setData(next ?? seed());
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
    setData(seed());
  }, []);

  return { data, update, reset };
}
