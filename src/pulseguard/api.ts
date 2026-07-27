/**
 * PulseGuard — API client
 *
 * Ported from pulseguard-app/src/pulseguard/api.ts.
 * Includes link-config, enrollment, and test-progress endpoints.
 * Snapshot and voice challenge endpoints are out of scope for cognitive port.
 *
 * Pattern: fetch with AbortController timeout, typed errors, no PII in logs.
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULSEGUARD_REQUEST_TIMEOUT_MS);

  try {
    const url = `${PULSEGUARD_LINK_CONFIG_PATH}?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': PULSEGUARD_API_KEY,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      let code = 'HTTP_ERROR';
      let message = `Link config fetch failed: ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; message?: string };
        if (body.error) code = body.error;
        if (body.message) message = body.message;
      } catch {
        // body not JSON
      }
      throw new PulseGuardApiError(res.status, code, message);
    }

    return res.json() as Promise<PulseGuardLinkConfig>;
  } finally {
    clearTimeout(timer);
  }
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULSEGUARD_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(PULSEGUARD_ENROLLMENT_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': PULSEGUARD_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      let code = 'HTTP_ERROR';
      let message = `Enrollment submission failed: ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; message?: string };
        if (body.error) code = body.error;
        if (body.message) message = body.message;
      } catch {
        // body not JSON
      }
      throw new PulseGuardApiError(res.status, code, message);
    }

    return res.json() as Promise<PulseGuardEnrollmentResponse>;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Test progress submission ──────────────────────────────────────

export async function submitPulseGuardTestProgress(
  payload: PulseGuardTestProgressPayload,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULSEGUARD_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(PULSEGUARD_ENROLLMENT_TEST_PROGRESS_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': PULSEGUARD_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      let code = 'HTTP_ERROR';
      let message = `Test progress submission failed: ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; message?: string };
        if (body.error) code = body.error;
        if (body.message) message = body.message;
      } catch {
        // body not JSON
      }
      throw new PulseGuardApiError(res.status, code, message);
    }
  } finally {
    clearTimeout(timer);
  }
}
