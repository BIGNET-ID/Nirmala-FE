'use client';

import { useEffect, useState } from 'react';

/**
 * Generic localStorage-backed state — same pattern as ThemeModeContext's own
 * persistence: an SSR-safe default first, then the stored value is read
 * once after mount (avoids a hydration mismatch), and every change is
 * written back.
 *
 * `hydrated` gates the write effect so it never fires before the read
 * effect has had a chance to apply the real stored value — without this
 * guard, the write effect's first run (still holding the SSR-safe default,
 * since the read's setValue hasn't landed yet in that same pass) would
 * clobber the real stored value with the default. This is easy to hit
 * under React StrictMode's dev-only double mount/cleanup/remount: the
 * spurious first write lands during the discarded mount, so the remount's
 * read picks up the wrong (default) value permanently. Confirmed by testing
 * (a persisted tab/map-type reverted to default on reload) before this
 * guard was added.
 */
export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored != null) setValue(JSON.parse(stored));
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value, hydrated]);

  return [value, setValue];
}
