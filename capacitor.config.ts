import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "it.swimforge.app",
  appName: "SwimForge",
  webDir: "dist/public",
  server: { hostname: "app.swimforge.it", androidScheme: "https" },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#0A1520" },
    StatusBar: { style: "DARK", overlaysWebView: false },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
