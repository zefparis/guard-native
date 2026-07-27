/**
 * DemoGuard — Type definitions
 *
 * Ported from pulseguard-app/src/demoguard/types.ts.
 * Only the types needed for cognitive enrollment (no camera, no motion, no orientation).
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import type { CognitiveSignals } from './cognitive/cognitiveTypes';
import type { BehaviorPayload, BehaviorSummary, TouchDiagnosticsBehaviorSafe } from './behavior/behaviorTypes';

// ─── Safe diagnostics contracts ────────────────────────────────────

export interface VoiceDiagnosticsSafe {
  status: 'passed' | 'review' | 'failed' | 'not_checked';
  reasonSafe: string;
  analysisMode: 'full_audio' | 'metadata_only' | 'skipped' | 'failed';
  audioCaptured: boolean;
  payloadPrepared: boolean;
  relayAttempted: boolean;
  relayAccepted: boolean;
  hcsAnalyzed: boolean;
  featuresExtracted: boolean;
  livenessStatus: 'present' | 'review' | 'absent' | 'unknown';
  confidence: number | null;
  latencyMs: number | null;
}

export interface DemoGuardVoiceSignal {
  recorded: boolean;
  duration_ms?: number;
  challenge_id?: string;
  quality: 'ok' | 'low' | 'missing' | 'unsupported';
  mfcc_available?: boolean;
}

// ─── Sensitive payload (only sent to proxy, never in UI/logs) ──────

export interface DemoGuardSensitive {
  selfie_b64?: string;
  voice_b64?: string;
  voice_mimetype?: string;
  mfcc_summary?: number[];
  voice_nonce?: string;
  voice_challenge_id?: string;
}
