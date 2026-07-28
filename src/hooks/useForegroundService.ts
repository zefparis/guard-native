/**
 * useForegroundService — React hook for the native Android foreground service
 *
 * Manages the lifecycle of the PulseGuard foreground service:
 *   - Requests POST_NOTIFICATIONS and ACTIVITY_RECOGNITION runtime permissions
 *   - Starts the service with heartbeat config (HTTP direct in Kotlin)
 *   - Stops the service on cleanup
 *   - Exposes service status (running / stopped / error)
 *
 * On iOS, all functions are no-ops (foreground service is Android-only).
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
    PULSEGUARD_API_KEY,
    PULSEGUARD_API_PATH,
    PULSEGUARD_SOURCE,
    PULSEGUARD_VERSION
} from '@/pulseguard/constants';

export type ServiceStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped';

export interface ForegroundServiceConfig {
  linkToken: string;
  hcsSessionPublicId: string;
  checkFrequencyMs: number;
}

export function useForegroundService() {
  const [status, setStatus] = useState<ServiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const startService = useCallback(async (config: ForegroundServiceConfig) => {
    if (Platform.OS !== 'android') return;
    if (startedRef.current) return;

    try {
      setStatus('starting');
      setError(null);

      const { default: ForegroundServiceModule } = await import(
        'expo-foreground-service'
      );

      await ForegroundServiceModule.startService({
        apiUrl: PULSEGUARD_API_PATH,
        apiKey: PULSEGUARD_API_KEY,
        linkToken: config.linkToken,
        hcsSessionPublicId: config.hcsSessionPublicId,
        checkFrequencyMs: config.checkFrequencyMs,
        source: PULSEGUARD_SOURCE,
        version: PULSEGUARD_VERSION,
      });

      startedRef.current = true;
      setStatus('running');
      console.info('[ForegroundService] Service started successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start foreground service';
      console.error('[ForegroundService] Start error:', msg);
      setError(msg);
      setStatus('error');
    }
  }, []);

  const stopService = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (!startedRef.current) return;

    try {
      const { default: ForegroundServiceModule } = await import(
        'expo-foreground-service'
      );
      await ForegroundServiceModule.stopService();
      startedRef.current = false;
      setStatus('stopped');
      console.info('[ForegroundService] Service stopped');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop foreground service';
      console.error('[ForegroundService] Stop error:', msg);
    }
  }, []);

  const isRunning = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    try {
      const { default: ForegroundServiceModule } = await import(
        'expo-foreground-service'
      );
      return await ForegroundServiceModule.isServiceRunning();
    } catch {
      return false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (startedRef.current) {
        void stopService();
      }
    };
  }, [stopService]);

  return {
    status,
    error,
    startService,
    stopService,
    isRunning,
  };
}
