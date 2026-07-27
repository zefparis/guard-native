/**
 * useLastCheckPersistence — Persist last check timestamp via AsyncStorage
 *
 * Ported from pulseguard-app/src/hooks/useLastCheckPersistence.ts.
 * Uses @react-native-async-storage/async-storage (Expo) instead of
 * @capacitor/preferences (Capacitor).
 *
 * Stores the timestamp of the last successful check so it survives OS kills.
 * This is the source of truth for inactivity detection on foreground return.
 *
 * Source of truth hierarchy:
 *   1. AsyncStorage (this hook) — survives OS kills, authoritative
 *   2. last_check_at (backend) — server-side, used for dashboard display
 *   3. lastCheckSentAtRef (in-memory) — ephemeral, used for scheduling only
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pulseguard_last_check_ts';

export function useLastCheckPersistence() {
  const cachedRef = useRef<number | null>(null);

  const persist = useCallback(async (timestampMs: number): Promise<void> => {
    cachedRef.current = timestampMs;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(timestampMs));
    } catch {
      // Best-effort — non-fatal if storage fails
    }
  }, []);

  const read = useCallback(async (): Promise<number | null> => {
    if (cachedRef.current !== null) return cachedRef.current;

    try {
      const value = await AsyncStorage.getItem(STORAGE_KEY);
      if (value) {
        const ts = parseInt(value, 10);
        if (!isNaN(ts) && ts > 0) {
          cachedRef.current = ts;
          return ts;
        }
      }
    } catch {
      // Best-effort — return null if storage fails
    }

    return null;
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  return { persist, read };
}
