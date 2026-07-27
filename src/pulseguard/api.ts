/**
 * PulseGuard — API client (connectivity layer)
 *
 * Ported from pulseguard-app/src/pulseguard/api.ts.
 * Only the link-config resolution is implemented in this step.
 * Remaining endpoints (snapshot, enrollment, voice challenge) will be
 * ported in subsequent steps.
 *
 * Pattern: fetch with AbortController timeout, typed errors, no PII in logs.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import {
  PULSEGUARD_LINK_CONFIG_PATH,
  PULSEGUARD_REQUEST_TIMEOUT_MS,
  PULSEGUARD_API_KEY,
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
