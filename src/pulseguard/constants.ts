/**
 * PulseGuard — Configuration constants
 *
 * Ported from pulseguard-app/src/pulseguard/constants.ts.
 * Adapted for React Native: import.meta.env replaced with expo-constants.
 *
 * In the periodic check model, checkFrequencyMs and captureWindowSec come
 * from the server via GET /api/pulseguard/link-config. The constants below
 * are FALLBACK values used only if the link-config call fails unexpectedly
 * after the token has already been validated (e.g. transient network loss).
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import Constants from 'expo-constants';

/**
 * Base URL for API calls. On web (Vercel), pulseguard-app uses empty string
 * so paths remain relative and are proxied via vercel.json rewrites.
 * On native (React Native), the origin has no server, so we use the
 * hybrid-vector-api Render URL directly, read from app.config.ts extra.
 */
const EXTRA = Constants.expoConfig?.extra as
  | { apiBaseUrl?: string; pulseguardApiKey?: string }
  | undefined;

export const API_BASE_URL = EXTRA?.apiBaseUrl || 'https://hybrid-vector-api-m5xt.onrender.com';

/** API key for authenticated PulseGuard endpoints. Read from app config. */
export const PULSEGUARD_API_KEY = EXTRA?.pulseguardApiKey || '';

/** Fallback check frequency (milliseconds) if link-config fetch fails. Default: 5 minutes. */
export const PULSEGUARD_FALLBACK_CHECK_FREQUENCY_MS = 5 * 60 * 1000;

/** Fallback capture window duration (seconds) if link-config fetch fails. Default: 30 seconds. */
export const PULSEGUARD_FALLBACK_CAPTURE_WINDOW_SEC = 30;

/** API endpoint for submitting signal snapshots. */
export const PULSEGUARD_API_PATH = `${API_BASE_URL}/api/pulseguard/signals`;

/** API endpoint for fetching link configuration from token. */
export const PULSEGUARD_LINK_CONFIG_PATH = `${API_BASE_URL}/api/pulseguard/link-config`;

/** Request timeout for snapshot submission (milliseconds). */
export const PULSEGUARD_REQUEST_TIMEOUT_MS = 15_000;

/** PulseGuard client version. */
export const PULSEGUARD_VERSION = '1.0.0';

/** API endpoint for submitting cognitive enrollment data. */
export const PULSEGUARD_ENROLLMENT_PATH = `${API_BASE_URL}/api/pulseguard/enrollment`;

/** API endpoint for publishing per-test enrollment progress events. */
export const PULSEGUARD_ENROLLMENT_TEST_PROGRESS_PATH = `${API_BASE_URL}/api/pulseguard/enrollment/test-progress`;

/** API endpoint for requesting a voice challenge nonce (anti-replay). */
export const VOICE_CHALLENGE_API_PATH = `${API_BASE_URL}/api/demoguard/voice-challenge`;

/** Source identifier sent in payloads. */
export const PULSEGUARD_SOURCE = 'pulseguard_mobile' as const;
