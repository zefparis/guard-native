/**
 * guard-native — Expo app configuration
 *
 * Native client for HCS-U7 Guard modules (PulseGuard, DemoGuard, etc.)
 * Consumes the same backend endpoints as the current Capacitor-based apps.
 *
 * Bundle ID: com.iasolution.guard
 * (validated — consistent with com.iasolution.pulseguard)
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import type { ConfigContext, ExpoConfig } from '@expo/config';
import withForegroundService from './plugins/withForegroundService.js';

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig: ExpoConfig = {
  ...config,
  name: 'GuardNative',
  slug: 'guard-native',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'guardnative',
  userInterfaceStyle: 'automatic',

  ios: {
    bundleIdentifier: 'com.iasolution.guard',
    icon: './assets/expo.icon',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'GuardNative needs microphone access for vocal cognitive tests and liveness verification.',
    },
  },

  android: {
    package: 'com.iasolution.guard',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_HEALTH',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.ACTIVITY_RECOGNITION',
    ],
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-secure-store',
    [
      '@siteed/audio-studio',
      {
        enableNotifications: false,
        enableBackgroundAudio: false,
        enablePhoneStateHandling: false,
        enableDeviceDetection: false,
        iosConfig: {
          microphoneUsageDescription:
            'GuardNative needs microphone access for vocal cognitive tests and liveness verification.',
        },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    apiBaseUrl: process.env.GUARD_API_BASE_URL || 'https://hybrid-vector-api-m5xt.onrender.com',
    pulseguardApiKey: process.env.GUARD_PULSEGUARD_API_KEY || '',
  },
  };

  return withForegroundService(baseConfig);
};
