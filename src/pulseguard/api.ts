/**
 * PulseGuard — API client
 *
 * Ported from pulseguard-app/src/pulseguard/api.ts.
 * Includes link-config, enrollment, test-progress, and voice-challenge endpoints.
 *
 * Pattern: fetch with AbortController timeout, typed errors, no PII in logs.
 * All requests go through pgFetch() which centralizes:
 *   - x-api-key header injection
 *   - AbortController timeout
 *   - Consistent error parsing → PulseGuardApiError
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import {
    PULSEGUARD_API_KEY,
    PULSEGUARD_ENROLLMENT_PATH,
    PULSEGUARD_ENROLLMENT_TEST_PROGRESS_PATH,
    PULSEGUARD_LINK_CONFIG_PATH,
    PULSEGUARD_REQUEST_TIMEOUT_MS,
    PULSEGUARD_SOURCE,
    VOICE_CHALLENGE_API_PATH,
} from './constants';

// ─── Types (identical to pulseguard-app) ──────────────────────────

export interface PulseGuardLinkConfig {
  ok: boolean;
  checkFrequencyMs: number;
  captureWindowSec: number;
  cognitiveEnrollmentRequired?: boolean;
}

// ─── Error class (identical to pulseguard-app) ────────────────────

export class PulseGuardApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PulseGuardApiError';
    this.status = status;
    this.code = code;
  }
}

// ─── Centralized fetch wrapper ────────────────────────────────────

/**
 * Shared fetch wrapper for all PulseGuard API calls.
 *
 * - Injects the x-api-key header on every request (the link-config route
 *   ignores it, but enrollment and test-progress routes require it).
 * - Sets up AbortController timeout.
 * - Parses error responses into PulseGuardApiError.
 *
 * Using this wrapper ensures no future endpoint can accidentally omit
 * the API key header.
 */
async function pgFetch(
  url: string,
  options: {
    method: 'GET' | 'POST';
    body?: unknown;
  },
): Promise<Response> {
  if (!PULSEGUARD_API_KEY) {
    console.warn(
      '[PULSEGUARD_API] PULSEGUARD_API_KEY is empty — authenticated endpoints will fail. ' +
      'Set GUARD_PULSEGUARD_API_KEY in your .env file and rebuild the app.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULSEGUARD_REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'x-api-key': PULSEGUARD_API_KEY,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      let code = 'HTTP_ERROR';
      let message = `PulseGuard API call failed: ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; message?: string };
        if (body.error) code = body.error;
        if (body.message) message = body.message;
      } catch {
        // body not JSON
      }
      throw new PulseGuardApiError(res.status, code, message);
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Link config resolution ───────────────────────────────────────

/**
 * Fetch check configuration from a signed link token.
 *
 * GET /api/pulseguard/link-config?token=...
 *
 * No API key required — the token itself is the proof of identity.
 * The x-api-key header is sent for consistency with other endpoints
 * but is not checked by the backend for this route.
 */
export async function fetchLinkConfig(
  token: string,
): Promise<PulseGuardLinkConfig> {
  const url = `${PULSEGUARD_LINK_CONFIG_PATH}?token=${encodeURIComponent(token)}`;
  const res = await pgFetch(url, { method: 'GET' });
  return res.json() as Promise<PulseGuardLinkConfig>;
}

// ─── Enrollment types ──────────────────────────────────────────────

export interface PulseGuardEnrollmentPayload {
  hcs_session_public_id: string;
  link_token: string;
  source: typeof PULSEGUARD_SOURCE;
  cognitive_signals: {
    reflex: unknown;
    stroop: unknown;
    digit_span: unknown;
    n_back: unknown;
    trail_tap: unknown;
    vocal_ran: unknown;
    summary: unknown;
  };
  behavior: {
    taskBehaviors: unknown;
    summary: unknown;
  };
  touchDiagnosticsBehavior: unknown;
  voice_diagnostics?: unknown;
  sensitive?: {
    voice_b64?: string;
    voice_mimetype?: string;
    voice_nonce?: string;
    voice_challenge_id?: string;
  };
}

export interface PulseGuardEnrollmentResponse {
  ok: boolean;
  received: boolean;
  cognitiveStatus: 'passed' | 'review' | 'failed';
  decisionCap: 'APPROVED' | 'REVIEW' | 'REJECTED';
  message?: string;
}

export interface PulseGuardTestProgressPayload {
  hcs_session_public_id: string;
  link_token: string;
  source: typeof PULSEGUARD_SOURCE;
  test_name: string;
  test_index: number;
  total_tests: number;
  quality: string;
  qualitative_summary: string;
}

// ─── Enrollment submission ─────────────────────────────────────────

export async function submitPulseGuardEnrollment(
  payload: PulseGuardEnrollmentPayload,
): Promise<PulseGuardEnrollmentResponse> {
  const res = await pgFetch(PULSEGUARD_ENROLLMENT_PATH, {
    method: 'POST',
    body: payload,
  });
  return res.json() as Promise<PulseGuardEnrollmentResponse>;
}

// ─── Test progress submission ──────────────────────────────────────

export async function submitPulseGuardTestProgress(
  payload: PulseGuardTestProgressPayload,
): Promise<void> {
  await pgFetch(PULSEGUARD_ENROLLMENT_TEST_PROGRESS_PATH, {
    method: 'POST',
    body: payload,
  });
}

// ─── Voice challenge (anti-replay nonce) ───────────────────────────

export interface VoiceChallengeResponse {
  ok: boolean;
  success: boolean;
  nonce?: string;
  challenge_id?: string;
  expires_at?: number;
  error?: string;
}

/**
 * Request a voice challenge nonce from the backend before audio capture.
 *
 * Uses pgFetch to ensure x-api-key header is included (the voice-challenge
 * endpoint requires it via apiKeyMiddleware).
 *
 * If this fails, the caller falls back to a local challenge_id (compat mode).
 */
export async function requestVoiceChallenge(
  sessionPublicId: string,
): Promise<VoiceChallengeResponse> {
  const res = await pgFetch(VOICE_CHALLENGE_API_PATH, {
    method: 'POST',
    body: {
      hcs_session_public_id: sessionPublicId,
      tenant_id: 'edguard-demo',
      source: PULSEGUARD_SOURCE,
    },
  });
  return res.json() as Promise<VoiceChallengeResponse>;
}
