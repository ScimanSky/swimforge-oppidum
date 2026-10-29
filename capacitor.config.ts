import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "it.swimforge.app",
  appName: "SwimForge",
  webDir: "dist/public",
  server: { hostname: "app.swimforge.it", androidScheme: "https" },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#0A1520" },
    // Edge-to-edge (MainActivity): the WebView draws under the transparent system bars and the
    // native build adds viewport-fit=cover (vite.config.ts), so env(safe-area-inset-*) carry the
    // bar sizes ("native": no injected --safe-area-inset-* variables, the CSS uses env()).
    // Light icons until the app theme sets them (lib/native-runtime.ts, syncNativeSystemBars).
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "cover", style: "DARK" },
    // No "alert": in the foreground the plugin would post its own system notification on top
    // of the in-app sonner toast (lib/push.ts). Background notifications are unaffected.
    PushNotifications: { presentationOptions: ["badge", "sound"] },
  },
};

export default config;
