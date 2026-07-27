/**
 * PulseGuard — StroopScreen (color-word conflict test)
 *
 * React Native port of pulseguard-app/src/screens/StroopScreen.tsx.
 * 6 trials, at least 3 conflict. User selects the displayed color, not the word.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BehaviorSession } from '@/pulseguard/behavior/behaviorSession';
import { recordStroopSelection, recordTaskStart } from '@/pulseguard/behavior/taskBehaviorRecorder';
import type { StroopSignal } from '@/pulseguard/cognitive/cognitiveTypes';
import type { StroopTrialConfig, StroopTrialResult } from '@/pulseguard/cognitive/stroopChallenge';
import {
    STROOP_TRIALS,
    computeStroopResult,
    generateStroopTrials,
    stroopColorWord,
    type StroopColor,
} from '@/pulseguard/cognitive/stroopChallenge';

const COLOR_MAP: Record<StroopColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab700',
};

const LOCALE = 'fr';

interface Props {
  session: BehaviorSession;
  onComplete: (signal: StroopSignal) => void;
  onError: (reason: string) => void;
}

export function StroopScreen({ session, onComplete }: Props) {
  const [trials] = useState<StroopTrialConfig[]>(() => generateStroopTrials(STROOP_TRIALS));
  const [trialIdx, setTrialIdx] = useState(0);
  const resultsRef = useRef<StroopTrialResult[]>([]);
  const trialStartRef = useRef<number>(0);

  useEffect(() => {
    recordTaskStart(session, 'stroop');
    trialStartRef.current = performance.now();
  }, [session]);

  const handleSelect = useCallback((color: StroopColor) => {
    const config = trials[trialIdx];
    const responseMs = performance.now() - trialStartRef.current;
    const correct = color === config.displayColor;
    const result: StroopTrialResult = { config, selected: color, correct, response_ms: responseMs };
    recordStroopSelection(session, color, correct, responseMs, false);
    resultsRef.current = [...resultsRef.current, result];

    if (trialIdx + 1 >= trials.length) {
      const signal = computeStroopResult(resultsRef.current);
      onComplete(signal);
    } else {
      setTrialIdx(trialIdx + 1);
      trialStartRef.current = performance.now();
    }
  }, [trials, trialIdx, session, onComplete]);

  const current = trials[trialIdx];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stroop Test</Text>
        <Text style={styles.progress}>2/6 — {trialIdx + 1}/{trials.length}</Text>
      </View>
      <View style={styles.content}>
        <Text
          style={[styles.stroopWord, { color: COLOR_MAP[current.displayColor] }]}
        >
          {stroopColorWord(current.word, LOCALE)}
        </Text>
        <Text style={styles.instruction}>
          Select the COLOR of the text, not the word itself.
        </Text>
        <View style={styles.options}>
          {(Object.entries(COLOR_MAP) as [StroopColor, string][]).map(([name, hex]) => (
            <Pressable
              key={name}
              style={[styles.option, { borderColor: hex }]}
              onPress={() => handleSelect(name)}
            >
              <Text style={[styles.optionText, { color: hex }]}>
                {stroopColorWord(name, LOCALE)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  progress: { fontSize: 14, color: '#888', marginTop: 4 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  stroopWord: { fontSize: 48, fontWeight: '700', marginBottom: 24 },
  instruction: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 24 },
  options: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  option: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    margin: 4,
  },
  optionText: { fontSize: 18, fontWeight: '700' },
});
