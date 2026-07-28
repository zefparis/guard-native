/**
 * withForegroundService — Expo config plugin (JS version for require())
 *
 * Adds Android permissions and service declaration to AndroidManifest.xml
 * for the PulseGuard foreground service (type: health).
 *
 * Permissions added:
 *   - FOREGROUND_SERVICE
 *   - FOREGROUND_SERVICE_HEALTH (Android 14+ / API 34+)
 *   - POST_NOTIFICATIONS (Android 13+ / API 33+)
 *   - ACTIVITY_RECOGNITION (Android 10+ / API 29+)
 *
 * Service declared:
 *   <service android:name="expo.modules.foregroundservice.PulseGuardForegroundService"
 *            android:foregroundServiceType="health"
 *            android:exported="false" />
 *
 * This plugin respects CNG: it modifies the manifest via the Expo config
 * plugin API, so changes survive `expo prebuild --clean`.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const REQUIRED_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_HEALTH',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.ACTIVITY_RECOGNITION',
];

const SERVICE_NAME = 'expo.modules.foregroundservice.PulseGuardForegroundService';

const withForegroundService = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    // ── Add permissions ──
    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    for (const permission of REQUIRED_PERMISSIONS) {
      const exists = androidManifest.manifest['uses-permission'].some(
        (item) => item.$ && item.$['android:name'] === permission,
      );
      if (!exists) {
        androidManifest.manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    }

    // ── Add service declaration to <application> ──
    const mainApplication =
      AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const serviceExists = mainApplication.service.some(
      (svc) => svc.$ && svc.$['android:name'] === SERVICE_NAME,
    );

    if (!serviceExists) {
      mainApplication.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'health',
        },
      });
    }

    return config;
  });
};

module.exports = withForegroundService;
