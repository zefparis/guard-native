/**
 * PulseGuard — WaitingScreen (observation / periodic monitoring mode)
 *
 * Ported from pulseguard-app/src/PulseGuardApp.tsx (waiting + checking phases).
 *
 * After enrollment success, the app transitions here. A JS timer schedules
 * periodic checks every checkFrequencyMs. Each check sends a snapshot to
 * the backend via submitPulseGuardSnapshot.
 *
 * On AppState change to background: the current check (if any) is cancelled.
 * On return to foreground: if inactivity >= 4 × checkFrequencyMs, triggers
 * a cognitive re-test callback. Otherwise, runs a catch-up check immediately.
 *
 * IMPORTANT: This timer only works while the app is in the foreground / JS
 * thread is active. Background persistence will be handled by a native
 * foreground service in a future step.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AppState,
    AppStateStatus,
    Platform,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLastCheckPersistence } from '@/hooks/useLastCheckPersistence';
import {
    PulseGuardApiError,
    submitPulseGuardSnapshot,
    type PulseGuardSnapshotPayload,
} from '@/pulseguard/api';
import {
    PULSEGUARD_SOURCE,
    PULSEGUARD_VERSION
} from '@/pulseguard/constants';

// ─── i18n (hardcoded FR, same as other guard-native screens) ───────

const STRINGS = {
  title: 'PulseGuard',
  monitoring: 'Monitoring actif',
  periodicMonitoring: 'Surveillance périodique en cours',
  checkInProgress: 'Vérification en cours…',
  checksSent: 'Checks envoyés',
  lastError: 'Dernière erreur',
  nextCheckIn: 'Prochain check dans',
  retestTriggered: 'Inactivité prolongée détectée — re-test cognitif requis.',
} as const;

const INACTIVITY_THRESHOLD_MULTIPLIER = 4;

// ─── Component ─────────────────────────────────────────────────────

interface Props {
  linkToken: string;
  checkFrequencyMs: number;
  captureWindowSec: number;
  onRetestRequired: () => void;
}

type WaitPhase = 'waiting' | 'checking';

export function WaitingScreen({
  linkToken,
  checkFrequencyMs,
  captureWindowSec,
  onRetestRequired,
}: Props) {
  const [phase, setPhase] = useState<WaitPhase>('waiting');
  const [checksSent, setChecksSent] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [nextCheckIn, setNextCheckIn] = useState(checkFrequencyMs / 1000);
  const [scheduleNonce, setScheduleNonce] = useState(0);

  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef(false);
  const startedAtRef = useRef('');
  const checkFrequencyRef = useRef(checkFrequencyMs);
  const captureWindowRef = useRef(captureWindowSec);
  const lastCheckSentAtRef = useRef(0);
  const onRetestRequiredRef = useRef(onRetestRequired);

  const { persist: persistLastCheck, read: readLastCheck } = useLastCheckPersistence();

  // Keep refs in sync with latest props
  useEffect(() => {
    checkFrequencyRef.current = checkFrequencyMs;
    captureWindowRef.current = captureWindowSec;
  }, [checkFrequencyMs, captureWindowSec]);

  useEffect(() => {
    onRetestRequiredRef.current = onRetestRequired;
  }, [onRetestRequired]);

  // ── Run a single periodic check ──
  const runCheck = useCallback(async () => {
    if (isCheckingRef.current) return;
    if (AppState.currentState === 'background') return;

    isCheckingRef.current = true;
    setPhase('checking');
    setLastError(null);
    startedAtRef.current = new Date().toISOString();

    // Wait for capture window duration
    const captureMs = captureWindowRef.current * 1000;
    await new Promise<void>((resolve) => {
      captureTimerRef.current = setTimeout(() => {
        captureTimerRef.current = null;
        resolve();
      }, captureMs);
    });

    // If backgrounded during capture, abort
    if (!isCheckingRef.current) return;

    isCheckingRef.current = false;

    // Build and send snapshot
    // Note: behavioral collectors (motion, touch, etc.) are not yet ported
    // to guard-native. The snapshot sends metadata only — the backend
    // handles this gracefully as a heartbeat-style check.
    const payload: PulseGuardSnapshotPayload = {
      hcs_session_public_id: `pg_${linkToken.slice(-12)}`,
      source: PULSEGUARD_SOURCE,
      link_token: linkToken,
      pulse_guard: {
        version: PULSEGUARD_VERSION,
        snapshot_at: new Date().toISOString(),
        started_at: startedAtRef.current,
        signals: {},
        trigger_reason: 'periodic',
      },
    };

    try {
      await submitPulseGuardSnapshot(payload);
      setChecksSent((n) => n + 1);
      lastCheckSentAtRef.current = Date.now();
      void persistLastCheck(lastCheckSentAtRef.current);
      console.info('[PulseGuard] Check sent successfully');
    } catch (err) {
      if (err instanceof PulseGuardApiError && err.code === 'LINK_REVOKED') {
        console.warn('[PulseGuard] Link revoked — stopping monitoring');
        setLastError('Lien révoqué');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Check submission failed';
      console.error('[PulseGuard] Check error:', msg);
      setLastError(msg);
    }

    setPhase('waiting');
  }, [linkToken, persistLastCheck]);

  // Keep runCheckRef in sync for AppState handler
  const runCheckRef = useRef<(() => Promise<void>) | null>(null);
  runCheckRef.current = runCheck;

  // ── Schedule checks when in waiting phase ──
  useEffect(() => {
    if (phase !== 'waiting') return;

    // Reset countdown
    setNextCheckIn(Math.floor(checkFrequencyRef.current / 1000));

    // Schedule next check
    checkTimerRef.current = setTimeout(() => {
      runCheck();
    }, checkFrequencyRef.current);

    // Countdown ticker (updates every second)
    let remaining = Math.floor(checkFrequencyRef.current / 1000);
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        setNextCheckIn(0);
      } else {
        setNextCheckIn(remaining);
      }
    }, 1000);

    return () => {
      if (checkTimerRef.current) {
        clearTimeout(checkTimerRef.current);
        checkTimerRef.current = null;
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [phase, checksSent, scheduleNonce, runCheck]);

  // ── AppState: background → foreground handling ──
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        // Cancel any in-progress check
        if (isCheckingRef.current) {
          isCheckingRef.current = false;
          if (captureTimerRef.current) {
            clearTimeout(captureTimerRef.current);
            captureTimerRef.current = null;
          }
          setPhase('waiting');
        }
        // Clear scheduled check timer
        if (checkTimerRef.current) {
          clearTimeout(checkTimerRef.current);
          checkTimerRef.current = null;
        }
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      } else if (nextState === 'active') {
        // On foreground return: check inactivity
        const now = Date.now();
        const inactivityThreshold = checkFrequencyRef.current * INACTIVITY_THRESHOLD_MULTIPLIER;

        void readLastCheck().then((persistedTs) => {
          const lastActivityTs =
            persistedTs ?? (lastCheckSentAtRef.current > 0 ? lastCheckSentAtRef.current : null);

          if (lastActivityTs !== null) {
            const elapsed = now - lastActivityTs;

            if (elapsed >= inactivityThreshold) {
              console.info(
                `[PulseGuard] Inactivity detected: ${Math.round(elapsed / 1000)}s elapsed, ` +
                `threshold ${Math.round(inactivityThreshold / 1000)}s — triggering cognitive re-test`,
              );
              onRetestRequiredRef.current();
            } else if (elapsed >= checkFrequencyRef.current && runCheckRef.current) {
              // Normal catch-up: missed cycles but below re-test threshold
              runCheckRef.current();
            }
          }
          // Always re-schedule the timer on foreground return, even if no
          // catch-up check was needed. The background handler cleared the
          // timer manually, but the useEffect doesn't re-run unless a dep
          // changes. Incrementing scheduleNonce forces re-scheduling.
          setScheduleNonce((n) => n + 1);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [readLastCheck]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  // ── Render ──

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🫀</Text>
        <Text style={styles.title}>{STRINGS.title}</Text>
        <Text style={styles.statusLabel}>
          {phase === 'checking' ? STRINGS.checkInProgress : STRINGS.monitoring}
        </Text>
        <Text style={styles.muted}>{STRINGS.periodicMonitoring}</Text>

        <View style={styles.statsContainer}>
          <Text style={styles.statLabel}>
            {STRINGS.checksSent}: {checksSent}
          </Text>

          {phase === 'waiting' && nextCheckIn > 0 && (
            <Text style={styles.countdown}>
              {STRINGS.nextCheckIn} {nextCheckIn}s
            </Text>
          )}

          {lastError && (
            <Text style={styles.errorText}>
              {STRINGS.lastError}: {lastError}
            </Text>
          )}
        </View>

        {Platform.OS === 'android' && (
          <Text style={styles.platformNote}>
            Le monitoring fonctionne uniquement au premier plan.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  statusLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#208AEF',
    marginBottom: 8,
    textAlign: 'center',
  },
  muted: { fontSize: 14, color: '#888', marginBottom: 24, textAlign: 'center' },
  statsContainer: {
    alignItems: 'center',
    gap: 12,
  },
  statLabel: { fontSize: 14, color: '#555' },
  countdown: { fontSize: 14, color: '#208AEF', fontWeight: '500' },
  errorText: { fontSize: 13, color: '#ef4444', textAlign: 'center' },
  platformNote: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 24,
    textAlign: 'center',
  },
});
