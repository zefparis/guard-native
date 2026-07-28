/**
 * expo-foreground-service — Local Expo module
 *
 * Provides a native Android foreground service (type: health) that sends
 * periodic heartbeat snapshots to the PulseGuard backend while the app
 * is in the background. The JS timer in WaitingScreen handles foreground
 * checks; this service ensures continuity when the JS thread is suspended.
 *
 * Milestone 1: heartbeat only (no motion sensors). The service sends
 * submitPulseGuardSnapshot with background_heartbeat=true at the same
 * checkFrequencyMs interval as the JS timer.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import ExpoForegroundServiceModule from './src/ExpoForegroundServiceModule';

export default ExpoForegroundServiceModule;
