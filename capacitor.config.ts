import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.eightbitweather.app',
  appName: '8-Bit Weather',
  webDir: 'dist-native',
  ios: {
    contentInset: 'never',
    backgroundColor: '#fff7e8',
    preferredContentMode: 'mobile',
  },
};

export default config;
