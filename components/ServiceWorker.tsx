'use client';

import { useEffect } from 'react';

/** Registers the offline shell. Dev builds are skipped so HMR is not cached. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const id = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, 1200);
    return () => clearTimeout(id);
  }, []);
  return null;
}
