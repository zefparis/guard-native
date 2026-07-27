/**
 * PulseGuard — ReflexScreen (5-round reaction time test)
 *
 * React Native port of pulseguard-app/src/screens/ReflexScreen.tsx.
 * Uses standard RN primitives (View, Text, TouchableOpacity, Pressable).
 * Exact same logic: 5 rounds, random delay 700-2200ms, too_fast/too_slow thresholds.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  REFLEX_ROUNDS,
  getRandomReflexDelay,
  evaluateReflexRound,
  computeReflexResult,
} from '@/pulseguard/cognitive/reflexChallenge';
import type { ReflexSignal } from '@/pulseguard/cognitive/cognitiveTypes';
import type { ReflexRoundResult } from '@/pulseguard/cognitive/reflexChallenge';
import { recordTaskStart, recordReflexTap } from '@/pulseguard/behavior/taskBehaviorRecorder';
import type { BehaviorSession } from '@/pulseguard/behavior/behaviorSession';

interface Props {
  session: BehaviorSession;
  onComplete: (signal: ReflexSignal) => void;
  onError: (reason: string) => void;
}

type State = 'waiting' | 'ready' | 'go' | 'too-early' | 'done';

export function ReflexScreen({ session, onComplete }: Props) {
  const [round, setRound] = useState(0);
  const [state, setState] = useState<State>('waiting');
  const [lastMs, setLastMs] = useState(0);
  const resultsRef = useRef<ReflexRoundResult[]>([]);
  const goTimeRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundRef = useRef(0);

  const startRound = useCallback(() => {
    if (roundRef.current >= REFLEX_ROUNDS) {
      const signal = computeReflexResult(resultsRef.current);
      onComplete(signal);
      return;
    }
    setState('waiting');
    const delay = getRandomReflexDelay();
    timeoutRef.current = setTimeout(() => {
      goTimeRef.current = performance.now();
      setState('go');
    }, delay);
  }, [onComplete]);

  useEffect(() => {
    recordTaskStart(session, 'reflex');
    startRound();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [session, startRound]);

  const handleTap = () => {
    if (state === 'waiting') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setState('too-early');
      recordReflexTap(session, 0, true);
      setTimeout(() => startRound(), 1000);
      return;
    }
    if (state === 'go') {
      const ms = performance.now() - goTimeRef.current;
      const result = evaluateReflexRound(ms);
      recordReflexTap(session, ms, result.too_fast);
      resultsRef.current = [...resultsRef.current, result];
      setLastMs(result.ms);
      roundRef.current = roundRef.current + 1;
      setRound(roundRef.current);
      setState('done');
      setTimeout(() => {
        if (roundRef.current >= REFLEX_ROUNDS) {
          const signal = computeReflexResult(resultsRef.current);
          onComplete(signal);
        } else {
          startRound();
        }
      }, 500);
    }
  };

  const bgColor =
    state === 'go' ? '#22c55e'
    : state === 'too-early' ? '#ef4444'
    : '#3b82f6';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Reflex Test</Text>
        <Text style={styles.progress}>
          1/6 — Round {Math.min(round + 1, REFLEX_ROUNDS)}/{REFLEX_ROUNDS}
        </Text>
      </View>
      <Pressable
        style={[styles.area, { backgroundColor: bgColor }]}
        onPress={handleTap}
      >
        {state === 'waiting' && <Text style={styles.areaText}>Wait for green...</Text>}
        {state === 'go' && <Text style={styles.areaTextBold}>TAP!</Text>}
        {state === 'too-early' && <Text style={styles.areaText}>Too early! Wait for green.</Text>}
        {state === 'done' && <Text style={styles.areaTextBold}>{lastMs} ms</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  progress: { fontSize: 14, color: '#888', marginTop: 4 },
  area: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  areaText: { fontSize: 20, color: '#fff', textAlign: 'center', paddingHorizontal: 20 },
  areaTextBold: { fontSize: 28, fontWeight: '700', color: '#fff' },
});
