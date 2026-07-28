// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add local Expo modules directory to Metro resolver so that
// `import 'expo-foreground-service'` resolves correctly.
const projectRoot = __dirname;
const modulesDir = path.join(projectRoot, 'modules');

config.resolver.nodeModulesPaths = [
  ...config.resolver.nodeModulesPaths,
  modulesDir,
];

config.watchFolders = [
  ...config.watchFolders,
  modulesDir,
];

module.exports = config;
