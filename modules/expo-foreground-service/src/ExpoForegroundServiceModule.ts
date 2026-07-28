/**
 * ExpoForegroundServiceModule — JS-side module declaration
 *
 * Exposes the native Kotlin module functions to JS:
 *   - startService(config): starts the foreground service with heartbeat config
 *   - stopService(): stops the foreground service
 *   - isServiceRunning(): returns whether the service is currently active
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { requireNativeModule } from 'expo-modules-core';

export interface HeartbeatConfig {
  apiUrl: string;
  apiKey: string;
  linkToken: string;
  hcsSessionPublicId: string;
  checkFrequencyMs: number;
  source: string;
  version: string;
}

type ForegroundServiceModuleType = {
  startService(config: HeartbeatConfig): Promise<void>;
  stopService(): Promise<void>;
  isServiceRunning(): Promise<boolean>;
};

const ForegroundServiceModule =
  requireNativeModule<ForegroundServiceModuleType>('ExpoForegroundService');

export default ForegroundServiceModule;
