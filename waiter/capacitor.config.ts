import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uz.xazora.waiter',
  appName: 'Xazora Официант',
  webDir: 'dist',
  server: {
    // the backend on the cashier PC is plain http in the local network: an https app page
    // would be blocked from calling it (mixed content), so the app itself is served over http too
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
