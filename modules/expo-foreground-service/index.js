/**
 * expo-foreground-service — Local Expo module (JS version for require())
 *
 * Provides a native Android foreground service (type: health) that sends
 * periodic heartbeat snapshots to the PulseGuard backend while the app
 * is in the background.
 *
 * Milestone 1: heartbeat only (no motion sensors).
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

const ExpoForegroundServiceModule = require('./src/ExpoForegroundServiceModule');

module.exports = ExpoForegroundServiceModule;
