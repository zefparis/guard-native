/**
 * PulseGuard — DigitSpanScreen (memory sequence test)
 *
 * React Native port of pulseguard-app/src/screens/DigitSpanScreen.tsx.
 * 3 trials, progressive length 3→5/6. Shows digits then asks user to repeat.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  generateDigitSpanTrials,
  evaluateDigitSpanTrial,
  computeDigitSpanResult,
} from '@/pulseguard/cognitive/digitSpanChallenge';
import type { DigitSpanSignal } from '@/pulseguard/cognitive/cognitiveTypes';
import type { DigitSpanTrialConfig, DigitSpanTrialResult } from '@/pulseguard/cognitive/digitSpanChallenge';
import { recordTaskStart, recordDigitSpanKey, recordDigitSpanSubmit } from '@/pulseguard/behavior/taskBehaviorRecorder';
import type { BehaviorSession } from '@/pulseguard/behavior/behaviorSession';

interface Props {
  session: BehaviorSession;
  onComplete: (signal: DigitSpanSignal) => void;
  onError: (reason: string) => void;
}

export function DigitSpanScreen({ session, onComplete }: Props) {
  const [trials] = useState<DigitSpanTrialConfig[]>(() => generateDigitSpanTrials());
  const [trialIdx, setTrialIdx] = useState(0);
  const [showing, setShowing] = useState(true);
  const [input, setInput] = useState<number[]>([]);
  const resultsRef = useRef<DigitSpanTrialResult[]>([]);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trialIdxRef = useRef(0);

  const showSequence = useCallback((idx: number) => {
    setShowing(true);
    setInput([]);
    const span = trials[idx].span;
    const duration = span * 800 + 500;
    showTimerRef.current = setTimeout(() => {
      setShowing(false);
    }, duration);
  }, [trials]);

  useEffect(() => {
    recordTaskStart(session, 'digit_span');
    showSequence(0);
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, [session, showSequence]);

  const handleDigit = (d: number) => {
    const newInput = [...input, d];
    setInput(newInput);
    recordDigitSpanKey(session, false);
  };

  const handleDelete = () => {
    if (input.length > 0) {
      setInput(input.slice(0, -1));
      recordDigitSpanKey(session, true);
    }
  };

  const handleSubmit = () => {
    const config = trials[trialIdx];
    const result = evaluateDigitSpanTrial(config, input);
    recordDigitSpanSubmit(session);
    resultsRef.current = [...resultsRef.current, result];

    if (trialIdx + 1 >= trials.length) {
      const signal = computeDigitSpanResult(resultsRef.current);
      onComplete(signal);
    } else {
      const nextIdx = trialIdx + 1;
      trialIdxRef.current = nextIdx;
      setTrialIdx(nextIdx);
      setInput([]);
      setTimeout(() => showSequence(nextIdx), 500);
    }
  };

  const current = trials[trialIdx];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Digit Span</Text>
        <Text style={styles.progress}>3/6 — {trialIdx + 1}/{trials.length}</Text>
      </View>
      <View style={styles.content}>
        {showing ? (
          <View style={styles.centerArea}>
            <Text style={styles.muted}>Memorize the sequence:</Text>
            <Text style={styles.sequence}>{current.sequence.join(' ')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.centerArea}>
              <Text style={styles.muted}>
                Enter the sequence ({current.span} digits):
              </Text>
              <Text style={styles.inputDisplay}>
                {input.join(' ') || '—'}
              </Text>
            </View>
            <View style={styles.keypad}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <Pressable
                  key={d}
                  style={styles.key}
                  onPress={() => handleDigit(d)}
                >
                  <Text style={styles.keyText}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.btnSecondary} onPress={handleDelete}>
                <Text style={styles.btnSecondaryText}>Delete</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, input.length === 0 && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={input.length === 0}
              >
                <Text style={styles.btnText}>Submit</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  progress: { fontSize: 14, color: '#888', marginTop: 4 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  centerArea: { alignItems: 'center', marginBottom: 24 },
  muted: { fontSize: 16, color: '#888', marginBottom: 12 },
  sequence: { fontSize: 36, fontWeight: '700', letterSpacing: 8 },
  inputDisplay: { fontSize: 32, fontWeight: '700', letterSpacing: 4, minHeight: 44 },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: { fontSize: 24, fontWeight: '700', color: '#1a1a1a' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16, paddingHorizontal: 20 },
  btn: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: '#208AEF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#208AEF', fontSize: 16, fontWeight: '600' },
});
