/**
 * PulseGuard — Cognitive Enrollment Orchestrator (React Native)
 *
 * Runs the 5-test cognitive battery (reflex → stroop → digit span →
 * n-back → trail tap) with behavior recording, computes the cognitive
 * summary, and submits the enrollment payload to the backend.
 *
 * Vocal RAN is out of scope for this port — vocal_ran signal is null.
 *
 * Ported from pulseguard-app/src/components/PulseGuardEnrollment.tsx.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useState, useRef, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BehaviorSession } from '@/pulseguard/behavior/behaviorSession';
import { computeCognitiveSummary } from '@/pulseguard/cognitive/cognitiveScoring';
import type {
  CognitiveSignals,
  CognitiveQuality,
  ReflexSignal,
  StroopSignal,
  DigitSpanSignal,
  NBackSignal,
  TrailTapSignal,
} from '@/pulseguard/cognitive/cognitiveTypes';
import { ReflexScreen } from '@/screens/ReflexScreen';
import { StroopScreen } from '@/screens/StroopScreen';
import { DigitSpanScreen } from '@/screens/DigitSpanScreen';
import { NBackScreen } from '@/screens/NBackScreen';
import { TrailTapScreen } from '@/screens/TrailTapScreen';
import {
  submitPulseGuardEnrollment,
  submitPulseGuardTestProgress,
  type PulseGuardEnrollmentPayload,
  type PulseGuardApiError,
} from '@/pulseguard/api';
import { PULSEGUARD_SOURCE } from '@/pulseguard/constants';

// ─── Per-test qualitative summaries ────────────────────────────────

const TEST_ORDER = ['reflex', 'stroop', 'digit_span', 'n_back', 'trail_tap'] as const;
const TOTAL_TESTS = TEST_ORDER.length;

function summarizeReflex(s: ReflexSignal): string {
  if (s.avg_ms < 250) return 'fast_reactions';
  if (s.avg_ms <= 400) return 'normal_reactions';
  return 'slow_reactions';
}

function summarizeStroop(s: StroopSignal): string {
  if (s.accuracy > 0.8) return 'good_concentration';
  if (s.accuracy >= 0.5) return 'average_concentration';
  return 'concentration_difficulties';
}

function summarizeDigitSpan(s: DigitSpanSignal): string {
  if (s.max_span >= 7) return 'good_memory';
  if (s.max_span >= 5) return 'average_memory';
  return 'memory_difficulties';
}

function summarizeNBack(s: NBackSignal): string {
  if (s.accuracy > 0.8) return 'good_attention';
  if (s.accuracy >= 0.5) return 'average_attention';
  return 'attention_difficulties';
}

function summarizeTrailTap(s: TrailTapSignal): string {
  if (s.completion_ms < 15000) return 'fluid_execution';
  if (s.completion_ms <= 25000) return 'average_execution';
  return 'slow_execution';
}

function sendTestProgress(
  testName: typeof TEST_ORDER[number],
  testIndex: number,
  quality: CognitiveQuality,
  qualitativeSummary: string,
  linkToken: string,
): void {
  const payload = {
    hcs_session_public_id: `pg_${linkToken.slice(-12)}`,
    link_token: linkToken,
    source: PULSEGUARD_SOURCE,
    test_name: testName,
    test_index: testIndex,
    total_tests: TOTAL_TESTS,
    quality,
    qualitative_summary: qualitativeSummary,
  };
  void submitPulseGuardTestProgress(payload).catch((err) => {
    console.warn(`[PULSEGUARD_ENROLLMENT] test progress failed for ${testName} (suppressed):`, err instanceof Error ? err.message : String(err));
  });
}

// ─── Component ─────────────────────────────────────────────────────

type EnrollmentPhase =
  | 'intro'
  | 'reflex'
  | 'stroop'
  | 'digit_span'
  | 'n_back'
  | 'trail_tap'
  | 'submitting'
  | 'done'
  | 'error';

interface Props {
  linkToken: string;
  onComplete: () => void;
}

export function CognitiveEnrollment({ linkToken, onComplete }: Props) {
  const [phase, setPhase] = useState<EnrollmentPhase>('intro');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionRef = useRef<BehaviorSession>(new BehaviorSession());
  const signalsRef = useRef<CognitiveSignals>({
    reflex: null,
    stroop: null,
    digit_span: null,
    n_back: null,
    trail_tap: null,
    vocal_ran: null,
    summary: null,
  });

  const startEnrollment = () => {
    sessionRef.current = new BehaviorSession();
    signalsRef.current = {
      reflex: null,
      stroop: null,
      digit_span: null,
      n_back: null,
      trail_tap: null,
      vocal_ran: null,
      summary: null,
    };
    setPhase('reflex');
  };

  const submitEnrollment = useCallback(async () => {
    setPhase('submitting');
    setErrorMessage(null);

    const signals = signalsRef.current;
    const summary = computeCognitiveSummary(signals);
    signals.summary = summary;

    const behavior = sessionRef.current.getPayload();
    const touchDiagnosticsBehavior = sessionRef.current.getTouchDiagnostics();

    const payload: PulseGuardEnrollmentPayload = {
      hcs_session_public_id: `pg_${linkToken.slice(-12)}`,
      link_token: linkToken,
      source: PULSEGUARD_SOURCE,
      cognitive_signals: {
        reflex: signals.reflex,
        stroop: signals.stroop,
        digit_span: signals.digit_span,
        n_back: signals.n_back,
        trail_tap: signals.trail_tap,
        vocal_ran: signals.vocal_ran,
        summary,
      },
      behavior,
      touchDiagnosticsBehavior,
    };

    try {
      await submitPulseGuardEnrollment(payload);
      setPhase('done');
    } catch (err) {
      const isApiError = (e: unknown): e is PulseGuardApiError =>
        e instanceof Error && e.name === 'PulseGuardApiError';
      const msg = isApiError(err) ? err.message : 'Enrollment submission failed';
      setErrorMessage(msg);
      setPhase('error');
    }
  }, [linkToken]);

  // ── Screen completion handlers ──

  const onReflexComplete = (signal: ReflexSignal) => {
    signalsRef.current.reflex = signal;
    sendTestProgress('reflex', 1, signal.quality, summarizeReflex(signal), linkToken);
    setPhase('stroop');
  };

  const onStroopComplete = (signal: StroopSignal) => {
    signalsRef.current.stroop = signal;
    sendTestProgress('stroop', 2, signal.quality, summarizeStroop(signal), linkToken);
    setPhase('digit_span');
  };

  const onDigitSpanComplete = (signal: DigitSpanSignal) => {
    signalsRef.current.digit_span = signal;
    sendTestProgress('digit_span', 3, signal.quality, summarizeDigitSpan(signal), linkToken);
    setPhase('n_back');
  };

  const onNBackComplete = (signal: NBackSignal) => {
    signalsRef.current.n_back = signal;
    sendTestProgress('n_back', 4, signal.quality, summarizeNBack(signal), linkToken);
    setPhase('trail_tap');
  };

  const onTrailTapComplete = (signal: TrailTapSignal) => {
    signalsRef.current.trail_tap = signal;
    sendTestProgress('trail_tap', 5, signal.quality, summarizeTrailTap(signal), linkToken);
    submitEnrollment();
  };

  const onError = (reason: string) => {
    setErrorMessage(reason);
    setPhase('error');
  };

  // ── Render ──

  if (phase === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emoji}>🧠</Text>
          <Text style={styles.heading}>Cognitive Enrollment</Text>
          <Text style={styles.description}>
            You will complete 5 short cognitive tests: Reflex, Stroop, Digit Span, N-Back, and Trail Tap.
            This takes about 3-4 minutes. Find a quiet place and focus.
          </Text>
          <Pressable style={styles.btn} onPress={startEnrollment}>
            <Text style={styles.btnText}>Start</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'submitting') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#208AEF" />
          <Text style={styles.muted}>Submitting enrollment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emoji}>✅</Text>
          <Text style={styles.heading}>Enrollment Complete</Text>
          <Text style={styles.description}>
            Your cognitive profile has been submitted successfully.
          </Text>
          <Pressable style={styles.btn} onPress={onComplete}>
            <Text style={styles.btnText}>Continue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.heading}>Error</Text>
          <Text style={styles.description}>{errorMessage}</Text>
          <Pressable style={styles.btn} onPress={startEnrollment}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Cognitive test screens ──

  const session = sessionRef.current;

  switch (phase) {
    case 'reflex':
      return <ReflexScreen session={session} onComplete={onReflexComplete} onError={onError} />;
    case 'stroop':
      return <StroopScreen session={session} onComplete={onStroopComplete} onError={onError} />;
    case 'digit_span':
      return <DigitSpanScreen session={session} onComplete={onDigitSpanComplete} onError={onError} />;
    case 'n_back':
      return <NBackScreen session={session} onComplete={onNBackComplete} onError={onError} />;
    case 'trail_tap':
      return <TrailTapScreen session={session} onComplete={onTrailTapComplete} onError={onError} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  heading: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  description: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  muted: { fontSize: 16, color: '#888', marginTop: 16 },
  btn: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
