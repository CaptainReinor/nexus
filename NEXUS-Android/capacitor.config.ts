import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig={
  appId:'ru.nexus.mobile',
  appName:'NEXUS',
  webDir:'dist',
  android:{allowMixedContent:false},
  plugins:{SystemBars:{style:'DARK',insetsHandling:'css',initialViewportFitValueHint:'cover'}}
};
export default config;
