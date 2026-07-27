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

import type { ExpoConfig, ConfigContext } from '@expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
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
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
