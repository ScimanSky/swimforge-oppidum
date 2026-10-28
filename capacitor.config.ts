import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "it.swimforge.app",
  appName: "SwimForge",
  webDir: "dist/public",
  server: { hostname: "app.swimforge.it", androidScheme: "https" },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#0A1520" },
    StatusBar: { style: "DARK", overlaysWebView: false },
    // No "alert": in the foreground the plugin would post its own system notification on top
    // of the in-app sonner toast (lib/push.ts). Background notifications are unaffected.
    PushNotifications: { presentationOptions: ["badge", "sound"] },
  },
};

export default config;
