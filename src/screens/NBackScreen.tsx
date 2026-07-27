/**
 * PulseGuard — NBackScreen (1-back matching test)
 *
 * React Native port of pulseguard-app/src/screens/NBackScreen.tsx.
 * Phase 1: Intro with visual example
 * Phase 2: 2 practice trials with feedback
 * Phase 3: 8 real trials with discreet feedback
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  NBACK_TRIALS,
  generateNBackTrials,
  evaluateNBackTrial,
  computeNBackResult,
  generateNBackPracticeTrials,
} from '@/pulseguard/cognitive/nBackChallenge';
import type { NBackSignal } from '@/pulseguard/cognitive/cognitiveTypes';
import type { NBackTrialConfig, NBackTrialResult } from '@/pulseguard/cognitive/nBackChallenge';
import { recordTaskStart, recordNBackDecision } from '@/pulseguard/behavior/taskBehaviorRecorder';
import type { BehaviorSession } from '@/pulseguard/behavior/behaviorSession';

type ScreenPhase = 'intro' | 'practice' | 'test';
type FeedbackState = 'none' | 'correct' | 'incorrect' | 'answered';

interface Props {
  session: BehaviorSession;
  onComplete: (signal: NBackSignal) => void;
  onError: (reason: string) => void;
}

export function NBackScreen({ session, onComplete }: Props) {
  const [phase, setPhase] = useState<ScreenPhase>('intro');
  const [trials, setTrials] = useState<NBackTrialConfig[]>([]);
  const [practiceTrials] = useState<NBackTrialConfig[]>(() => generateNBackPracticeTrials());
  const [trialIdx, setTrialIdx] = useState(0);
  const [showing, setShowing] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState>('none');
  const resultsRef = useRef<NBackTrialResult[]>([]);
  const trialStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    recordTaskStart(session, 'n_back');
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [session]);

  const showTrial = useCallback(() => {
    setShowing(true);
    setFeedback('none');
    trialStartRef.current = performance.now();
    timerRef.current = setTimeout(() => setShowing(false), 2000);
  }, []);

  const startPractice = () => {
    setPhase('practice');
    setTrialIdx(0);
    resultsRef.current = [];
    setTimeout(() => showTrial(), 100);
  };

  const startTest = () => {
    const newTrials = generateNBackTrials(NBACK_TRIALS);
    setTrials(newTrials);
    setPhase('test');
    setTrialIdx(0);
    resultsRef.current = [];
    setTimeout(() => showTrial(), 100);
  };

  const handleResponse = (saidMatch: boolean) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const currentTrials = phase === 'practice' ? practiceTrials : trials;
    const config = currentTrials[trialIdx];
    const responseMs = performance.now() - trialStartRef.current;
    const result = evaluateNBackTrial(config, saidMatch, responseMs);

    if (phase === 'practice') {
      const isCorrect = (config.isTarget && saidMatch) || (!config.isTarget && !saidMatch);
      setFeedback(isCorrect ? 'correct' : 'incorrect');
      resultsRef.current = [...resultsRef.current, result];

      if (trialIdx + 1 >= practiceTrials.length) {
        setTimeout(() => startTest(), 1200);
      } else {
        setTrialIdx(trialIdx + 1);
        setTimeout(() => showTrial(), 1200);
      }
    } else {
      recordNBackDecision(session, result.isHit || result.isCorrectRejection, responseMs);
      setFeedback('answered');
      resultsRef.current = [...resultsRef.current, result];

      if (trialIdx + 1 >= trials.length) {
        const signal = computeNBackResult(resultsRef.current);
        setTimeout(() => onComplete(signal), 400);
      } else {
        setTrialIdx(trialIdx + 1);
        setTimeout(() => showTrial(), 400);
      }
    }
  };

  // ── Intro Phase ──
  if (phase === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>N-Back Test</Text>
          <Text style={styles.progress}>4/6</Text>
        </View>
        <View style={styles.introContent}>
          <Text style={styles.introTitle}>You will see a sequence of letters</Text>
          <Text style={styles.introSubtitle}>
            Tap "YES" if the current letter matches the PREVIOUS one
          </Text>
          <View style={styles.exampleBox}>
            <View style={styles.exampleRow}>
              <Text style={styles.exampleLetter}>C</Text>
              <Text style={styles.exampleArrow}>→</Text>
              <Text style={styles.exampleLetter}>C</Text>
              <View style={styles.badgeSame}><Text style={styles.badgeText}>SAME</Text></View>
            </View>
            <View style={styles.exampleRow}>
              <Text style={styles.exampleLetter}>F</Text>
              <Text style={styles.exampleArrow}>→</Text>
              <Text style={styles.exampleLetter}>B</Text>
              <View style={styles.badgeDiff}><Text style={styles.badgeText}>DIFFERENT</Text></View>
            </View>
          </View>
          <Text style={styles.muted}>2 practice trials, then 8 real trials</Text>
          <Pressable style={styles.btn} onPress={startPractice}>
            <Text style={styles.btnText}>Start practice</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Practice / Test Phase ──
  const currentTrials = phase === 'practice' ? practiceTrials : trials;
  const totalTrials = currentTrials.length;
  const isPractice = phase === 'practice';

  const letterColor =
    feedback === 'correct' ? '#22c55e'
    : feedback === 'incorrect' ? '#ef4444'
    : '#1a1a1a';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{isPractice ? 'N-Back Practice' : 'N-Back Test'}</Text>
        <Text style={styles.progress}>4/6 — {trialIdx + 1}/{totalTrials}</Text>
      </View>
      <View style={styles.testContent}>
        <Text style={[styles.letter, { color: letterColor }]}>
          {showing ? currentTrials[trialIdx].letter : '—'}
        </Text>

        {!showing && feedback === 'none' && (
          <>
            <Text style={styles.instruction}>Does this match the previous letter?</Text>
            <View style={styles.buttonRow}>
              <Pressable style={styles.btnSecondary} onPress={() => handleResponse(false)}>
                <Text style={styles.btnSecondaryText}>NO</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={() => handleResponse(true)}>
                <Text style={styles.btnText}>YES</Text>
              </Pressable>
            </View>
          </>
        )}

        {showing && feedback === 'none' && (
          <Text style={styles.spacer}> </Text>
        )}

        {feedback === 'correct' && (
          <Text style={styles.feedbackCorrect}>✓ Correct!</Text>
        )}
        {feedback === 'incorrect' && (
          <Text style={styles.feedbackIncorrect}>
            {currentTrials[trialIdx].isTarget ? 'It was the SAME!' : 'It was DIFFERENT!'}
          </Text>
        )}
        {feedback === 'answered' && (
          <Text style={styles.feedbackAnswered}>✓</Text>
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
  introContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  introTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 8 },
  introSubtitle: { fontSize: 16, color: '#555', textAlign: 'center', marginBottom: 24 },
  exampleBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 20, marginBottom: 24, gap: 12 },
  exampleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exampleLetter: { fontSize: 28, fontWeight: '700', color: '#1a1a1a' },
  exampleArrow: { fontSize: 20, color: '#888' },
  badgeSame: { backgroundColor: '#22c55e', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeDiff: { backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  muted: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },
  btn: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  testContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  letter: { fontSize: 72, fontWeight: '700', marginBottom: 24 },
  instruction: { fontSize: 16, color: '#555', marginBottom: 20 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: '#208AEF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  btnSecondaryText: { color: '#208AEF', fontSize: 16, fontWeight: '600' },
  spacer: { fontSize: 16, color: 'transparent', minHeight: 24 },
  feedbackCorrect: { fontSize: 20, fontWeight: '700', color: '#22c55e' },
  feedbackIncorrect: { fontSize: 18, fontWeight: '600', color: '#ef4444', textAlign: 'center' },
  feedbackAnswered: { fontSize: 24, color: '#22c55e' },
});
