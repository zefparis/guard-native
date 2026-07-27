/**
 * PulseGuard — VoiceScreen (voice recording with vocal RAN challenge)
 *
 * React Native port of pulseguard-app/src/screens/VoiceScreen.tsx.
 * Uses @siteed/audio-studio for native audio recording (OGG/Opus on Android,
 * Measurement mode on iOS).
 *
 * 2-phase flow:
 *   Phase 1 (warm-up): user reads a cold-start phrase ("Hello, I am ready").
 *     NOT recorded — just prepares the mic.
 *   Phase 2 (capture): user reads the carrier phrase + digits.
 *     Recorded, encoded to base64, submitted with nonce + challenge_id.
 *
 * The nonce is requested from the backend during the idle/warm-up phase
 * so it's ready when capture starts. If the nonce request fails, falls
 * back to a local challenge_id (compat mode, same as pulseguard-app).
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import type { AudioAnalysis } from '@siteed/audio-studio';
import { AudioStudioModule, useAudioRecorder } from '@siteed/audio-studio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestVoiceChallenge } from '@/pulseguard/api';
import type { BehaviorSession } from '@/pulseguard/behavior/behaviorSession';
import { recordTaskStart } from '@/pulseguard/behavior/taskBehaviorRecorder';
import type { VocalRanSignal } from '@/pulseguard/cognitive/cognitiveTypes';
import {
    computeVocalRanResult,
    generateVocalRanChallenge,
} from '@/pulseguard/cognitive/vocalRanChallenge';
import type {
    DemoGuardVoiceSignal,
    VoiceDiagnosticsSafe,
} from '@/pulseguard/types';

// ─── Constants (matching pulseguard-app) ───────────────────────────

// VAD thresholds — aligned with pulseguard-app vad-thresholds.ts (P10-FINAL)
const VAD_ENERGY_THRESHOLD = 0.015;
const MIN_VOICED_DURATION_MS = 3000;
const MAX_RECORDING_MS = 12000;
const WARMUP_DURATION_MS = 3000;

// ─── i18n (hardcoded FR, same as other guard-native screens) ───────

const STRINGS = {
  title: 'Voix',
  warmupPrompt: 'Dites cette phrase pour démarrer le micro :',
  warmupPhrase: 'Bonjour, je suis prêt',
  warmupThen: 'Ensuite, lisez cette phrase à voix haute :',
  carrierPhrase: (digits: string) =>
    `Pour vérifier ma voix, je lis les chiffres affichés à l'écran, lentement, un par un : ${digits}.`,
  durationTarget: `L'enregistrement s'arrête automatiquement après ${MIN_VOICED_DURATION_MS / 1000}s de parole.`,
  record: 'Enregistrer',
  warmupInProgress: 'Amorçage du micro…',
  warmupHint: 'Parlez naturellement — l\'enregistrement démarre automatiquement.',
  recording: 'Enregistrement…',
  processing: 'Traitement…',
  done: 'Enregistrement terminé ✓',
  interrupted: 'L\'enregistrement a été interrompu. Gardez l\'app au premier plan et réessayez.',
  interruptedFinal: 'L\'enregistrement a été interrompu à deux reprises. Veuillez réessayer en gardant l\'application au premier plan.',
  voicedDurationTimeout: 'Pas assez de voix détectée. Parlez plus clairement et réessayez.',
  stop: 'Arrêter',
  autoStopHint: 'Arrêt automatique…',
  permissionRequired: 'Autorisation micro requise',
  permissionPrompt: 'Cette application a besoin d\'accéder au microphone pour l\'enregistrement vocal. Appuyez pour accorder l\'autorisation.',
  grantPermission: 'Accorder l\'autorisation',
  permissionBlocked: 'L\'autorisation du microphone a été refusée. Ouvrez les paramètres pour l\'activer manuellement.',
  openSettings: 'Ouvrir les paramètres',
} as const;

// ─── Recording config for @siteed/audio-studio ─────────────────────

function getRecordingConfig(onAudioAnalysis?: (analysis: AudioAnalysis) => Promise<void>) {
  const base = {
    sampleRate: 48000 as const,
    channels: 1 as const,
    encoding: 'pcm_16bit' as const,
    keepAwake: true,
    showNotification: false,
    maxDurationMs: MAX_RECORDING_MS,
    autoStopOnMaxDuration: true,
    enableProcessing: true,
    keepFullAnalysis: false,
    segmentDurationMs: 100,
    features: { rms: true },
    onAudioAnalysis,
    output: {
      primary: { enabled: false },
      compressed: {
        enabled: true,
        format: 'opus' as const,
        bitrate: 64000,
      },
    },
  };

  if (Platform.OS === 'ios') {
    return {
      ...base,
      ios: {
        audioSession: {
          category: 'Record' as const,
          mode: 'Measurement' as const,
          categoryOptions: [],
        },
      },
    };
  }

  return base;
}

// ─── Component ─────────────────────────────────────────────────────

interface Props {
  sessionPublicId: string;
  session: BehaviorSession;
  onComplete: (
    voice: DemoGuardVoiceSignal,
    diagnostic: VoiceDiagnosticsSafe | null,
    voiceB64: string | null,
    vocalRan: VocalRanSignal,
    voiceMimetype: string | null,
    voiceNonce: string | null,
    voiceChallengeId: string | null,
  ) => void;
  onError: (reason: string) => void;
}

type RecordingState = 'idle' | 'warming_up' | 'recording' | 'processing' | 'done';
type MicPermission = 'unknown' | 'granted' | 'denied' | 'blocked';

export function VoiceScreen({ sessionPublicId, session, onComplete, onError }: Props) {
  const recorder = useAudioRecorder();
  const [voiceNonce, setVoiceNonce] = useState<string | null>(null);
  const [serverChallengeId, setServerChallengeId] = useState<string | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(true);
  const [challenge] = useState(() => generateVocalRanChallenge());
  const [state, setState] = useState<RecordingState>('idle');
  const [interruptMsg, setInterruptMsg] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown');

  const startTimeRef = useRef<number>(0);
  const retryRef = useRef<boolean>(false);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── VAD refs (client-side voiced duration accumulator) ──
  const voicedDurationMsRef = useRef(0);
  const maxEnergyRef = useRef(1e-10);
  const vadActiveRef = useRef(false);
  const stoppingRef = useRef(false);
  const handleStopRef = useRef<() => void>(() => {});

  const [voicedProgressMs, setVoicedProgressMs] = useState(0);

  const digits = challenge.sequence.join(', ');
  const carrierPhrase = STRINGS.carrierPhrase(digits);

  // ── Record task start ──
  useEffect(() => {
    recordTaskStart(session, 'vocal_ran');
  }, [session]);

  // ── Check microphone permission on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'web') {
          setMicPermission('granted');
          return;
        }
        const result = await AudioStudioModule.getPermissionsAsync();
        if (cancelled) return;
        const granted = result?.granted ?? result?.status === 'granted';
        const canAskAgain = result?.canAskAgain ?? true;
        if (granted) {
          setMicPermission('granted');
        } else if (!canAskAgain) {
          setMicPermission('blocked');
        } else {
          setMicPermission('denied');
        }
      } catch {
        if (!cancelled) setMicPermission('denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Request nonce from backend (non-blocking, fallback to local) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await requestVoiceChallenge(sessionPublicId);
        if (cancelled) return;
        if (result.success && result.nonce && result.challenge_id) {
          setVoiceNonce(result.nonce);
          setServerChallengeId(result.challenge_id);
        }
      } catch {
        // Nonce request failed — fall back to local challenge_id (compat mode)
      } finally {
        if (!cancelled) setChallengeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionPublicId]);

  // ── Cleanup timers ──
  useEffect(() => {
    return () => {
      if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current);
    };
  }, []);

  // ── Read audio file as base64 ──
  const readAudioAsBase64 = useCallback(async (fileUri: string): Promise<string> => {
    return await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }, []);

  // ── Request microphone permission (triggers system dialog on Android) ──
  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    if (micPermission === 'granted') return true;

    try {
      const result = await AudioStudioModule.requestPermissionsAsync();
      const granted = result?.granted ?? result?.status === 'granted';
      const canAskAgain = result?.canAskAgain ?? true;

      if (granted) {
        setMicPermission('granted');
        return true;
      }
      if (!canAskAgain) {
        setMicPermission('blocked');
      } else {
        setMicPermission('denied');
      }
      return false;
    } catch {
      setMicPermission('denied');
      return false;
    }
  }, [micPermission]);

  // ── Open system settings (for permanently denied permission) ──
  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  // ── Main recording flow ──
  const handleRecord = useCallback(async () => {
    setInterruptMsg(null);

    // Ensure microphone permission before attempting recording
    const hasPermission = await ensureMicPermission();
    if (!hasPermission) {
      return; // Permission UI handles the next step
    }

    // Reset VAD state
    voicedDurationMsRef.current = 0;
    maxEnergyRef.current = 1e-10;
    vadActiveRef.current = false;
    stoppingRef.current = false;
    setVoicedProgressMs(0);

    setState('warming_up');

    try {
      // Build config with VAD callback
      const config = getRecordingConfig(async (analysis: AudioAnalysis) => {
        if (!vadActiveRef.current || stoppingRef.current) return;

        const segmentMs = analysis.segmentDurationMs || 100;
        for (const dp of analysis.dataPoints) {
          const rms = dp.rms ?? 0;
          const energy = rms * rms;
          if (energy > maxEnergyRef.current) {
            maxEnergyRef.current = energy;
          }
          const normalizedEnergy = energy / (maxEnergyRef.current || 1e-10);
          if (normalizedEnergy > VAD_ENERGY_THRESHOLD) {
            voicedDurationMsRef.current += segmentMs;
          }
        }

        setVoicedProgressMs(voicedDurationMsRef.current);

        // Auto-stop when cumulative voiced duration reaches threshold
        if (voicedDurationMsRef.current >= MIN_VOICED_DURATION_MS) {
          stoppingRef.current = true;
          vadActiveRef.current = false;
          handleStopRef.current();
        }
      });

      // Start recording — audio-studio handles the actual capture
      await recorder.startRecording(config);

      // Warm-up phase: wait WARMUP_DURATION_MS, then transition to "recording" state
      // The recording is already running, but we set startTimeRef here so
      // the RAN duration metric excludes warm-up time (same as pulseguard-app).
      warmupTimerRef.current = setTimeout(() => {
        startTimeRef.current = performance.now();
        vadActiveRef.current = true;
        setState('recording');
      }, WARMUP_DURATION_MS);
    } catch (err) {
      retryRef.current = false;
      onError(err instanceof Error ? err.message : 'Recording failed to start');
      setState('idle');
    }
  }, [recorder, ensureMicPermission]);

  // ── Stop recording and process result ──
  const handleStop = useCallback(async () => {
    if (warmupTimerRef.current) {
      clearTimeout(warmupTimerRef.current);
      warmupTimerRef.current = null;
    }

    vadActiveRef.current = false;
    setState('processing');

    try {
      const recording = await recorder.stopRecording();

      if (!recording) {
        onError('Recording failed — no audio captured');
        setState('idle');
        return;
      }

      const durationMs = performance.now() - startTimeRef.current;
      const voicedMs = voicedDurationMsRef.current;

      // Check minimum voiced duration (VAD-based)
      if (voicedMs < MIN_VOICED_DURATION_MS) {
        onError(STRINGS.voicedDurationTimeout);
        setState('idle');
        return;
      }

      // Use compressed file URI if available (OGG/Opus on Android), otherwise primary
      const audioUri = recording.compression?.compressedFileUri || recording.fileUri;
      const voiceMimetype = recording.compression?.mimeType || recording.mimeType || 'audio/ogg';

      // Read audio file as base64
      const voiceB64 = await readAudioAsBase64(audioUri);

      if (!voiceB64) {
        onError('Failed to encode audio');
        setState('idle');
        return;
      }

      const vocalRan = computeVocalRanResult(challenge, durationMs, true);

      const voiceSignal: DemoGuardVoiceSignal = {
        recorded: true,
        duration_ms: Math.round(durationMs),
        challenge_id: serverChallengeId || challenge.challenge_id,
        quality: voicedMs >= MIN_VOICED_DURATION_MS ? 'ok' : 'low',
      };

      const diagnostic: VoiceDiagnosticsSafe = {
        status: 'not_checked',
        reasonSafe: 'voice_checked',
        analysisMode: durationMs > 2000 ? 'full_audio' : 'metadata_only',
        audioCaptured: true,
        payloadPrepared: true,
        relayAttempted: false,
        relayAccepted: false,
        hcsAnalyzed: false,
        featuresExtracted: false,
        livenessStatus: 'unknown',
        confidence: null,
        latencyMs: null,
      };

      onComplete(
        voiceSignal,
        diagnostic,
        voiceB64,
        vocalRan,
        voiceMimetype,
        voiceNonce,
        serverChallengeId,
      );
      setState('done');
    } catch (err) {
      retryRef.current = false;
      onError(err instanceof Error ? err.message : 'Voice recording failed');
      setState('idle');
    }
  }, [recorder, challenge, serverChallengeId, voiceNonce, readAudioAsBase64, onComplete, onError]);

  // ── Keep handleStopRef in sync so the VAD callback can call it ──
  useEffect(() => {
    handleStopRef.current = handleStop;
  }, [handleStop]);

  // ── Render ──

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{STRINGS.title}</Text>
        <Text style={styles.progress}>6/6</Text>
      </View>

      <View style={styles.content}>
        {/* ── Permission gate: show before recording if permission not granted ── */}
        {state === 'idle' && micPermission !== 'granted' && micPermission !== 'unknown' && (
          <>
            <Text style={styles.statusLabel}>{STRINGS.permissionRequired}</Text>
            {micPermission === 'blocked' ? (
              <>
                <Text style={styles.muted}>{STRINGS.permissionBlocked}</Text>
                <Pressable style={styles.btn} onPress={handleOpenSettings}>
                  <Text style={styles.btnText}>{STRINGS.openSettings}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.muted}>{STRINGS.permissionPrompt}</Text>
                <Pressable style={styles.btn} onPress={handleRecord}>
                  <Text style={styles.btnText}>{STRINGS.grantPermission}</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {state === 'idle' && micPermission === 'unknown' && (
          <Text style={styles.muted}>...</Text>
        )}

        {state === 'idle' && micPermission === 'granted' && (
          <>
            {interruptMsg && (
              <Text style={styles.interruptMsg}>{interruptMsg}</Text>
            )}
            <Text style={styles.label}>{STRINGS.warmupPrompt}</Text>
            <Text style={styles.warmupPhrase}>{STRINGS.warmupPhrase}</Text>
            <Text style={styles.muted}>{STRINGS.warmupThen}</Text>
            <Text style={styles.carrierPhrase}>{carrierPhrase}</Text>
            <Text style={styles.muted}>{STRINGS.durationTarget}</Text>
            <Pressable
              style={[styles.btn, challengeLoading && styles.btnDisabled]}
              onPress={handleRecord}
              disabled={challengeLoading}
            >
              <Text style={styles.btnText}>
                {challengeLoading ? '...' : STRINGS.record}
              </Text>
            </Pressable>
          </>
        )}

        {state === 'warming_up' && (
          <>
            <Text style={styles.statusLabel}>{STRINGS.warmupInProgress}</Text>
            <Text style={styles.warmupPhrase}>{STRINGS.warmupPhrase}</Text>
            <Text style={styles.muted}>{STRINGS.warmupHint}</Text>
          </>
        )}

        {state === 'recording' && (
          <>
            <Text style={styles.statusLabel}>{STRINGS.recording}</Text>
            <Text style={styles.carrierPhrase}>{carrierPhrase}</Text>
            <Text style={styles.vadProgress}>
              {Math.min(voicedProgressMs, MIN_VOICED_DURATION_MS) / 1000}s / {MIN_VOICED_DURATION_MS / 1000}s
            </Text>
            <Text style={styles.muted}>{STRINGS.autoStopHint}</Text>
            <Pressable style={styles.btnStop} onPress={handleStop}>
              <Text style={styles.btnText}>{STRINGS.stop}</Text>
            </Pressable>
          </>
        )}

        {state === 'processing' && (
          <Text style={styles.muted}>{STRINGS.processing}</Text>
        )}

        {state === 'done' && (
          <Text style={styles.doneText}>{STRINGS.done}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  progress: { fontSize: 14, color: '#888', marginTop: 4 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  label: { fontSize: 16, color: '#555', marginBottom: 12, textAlign: 'center' },
  warmupPhrase: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 16, textAlign: 'center' },
  muted: { fontSize: 14, color: '#888', marginBottom: 12, textAlign: 'center' },
  carrierPhrase: { fontSize: 18, fontWeight: '600', color: '#1a1a1a', lineHeight: 28, marginBottom: 20, textAlign: 'center' },
  statusLabel: { fontSize: 20, fontWeight: '600', color: '#208AEF', marginBottom: 16, textAlign: 'center' },
  interruptMsg: { fontSize: 14, color: '#e67e22', fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  doneText: { fontSize: 18, fontWeight: '600', color: '#22c55e', textAlign: 'center' },
  btn: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center',
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.5 },
  btnStop: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center',
    marginTop: 24,
  },
  vadProgress: { fontSize: 16, fontWeight: '600', color: '#208AEF', marginBottom: 8, textAlign: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
