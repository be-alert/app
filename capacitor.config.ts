import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bealert.app',
  appName: 'Be Alert',
  webDir: 'dist',
  android: {
    // Serve the bundled web app from https://localhost (secure context → geolocation, crypto, etc.)
    allowMixedContent: false,
    // Never allow attaching Chrome DevTools to the release app.
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#f6f7fb',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    // Native Google account picker only; other providers are not bundled.
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
