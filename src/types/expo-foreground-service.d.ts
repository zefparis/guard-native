declare module 'expo-foreground-service' {
  export interface HeartbeatConfig {
    apiUrl: string;
    apiKey: string;
    linkToken: string;
    hcsSessionPublicId: string;
    checkFrequencyMs: number;
    source: string;
    version: string;
  }

  const ExpoForegroundService: {
    startService(config: HeartbeatConfig): Promise<void>;
    stopService(): Promise<void>;
    isServiceRunning(): Promise<boolean>;
  };

  export default ExpoForegroundService;
}
