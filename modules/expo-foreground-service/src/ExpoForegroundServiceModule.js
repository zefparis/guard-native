/**
 * ExpoForegroundServiceModule — JS-side module declaration (JS version for require())
 *
 * Exposes the native Kotlin module functions to JS:
 *   - startService(config): starts the foreground service with heartbeat config
 *   - stopService(): stops the foreground service
 *   - isServiceRunning(): returns whether the service is currently active
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

const { requireNativeModule } = require('expo-modules-core');

const ForegroundServiceModule = requireNativeModule('ExpoForegroundService');

module.exports = ForegroundServiceModule;
