import type { CapacitorConfig } from "@capacitor/cli";

/**
 * App nativa Android (Capacitor) — NO es PWA ni TWA.
 *
 * 1. Cambia server.url por la URL real de tu app en Render.
 * 2. npm install @capacitor/core @capacitor/cli @capacitor/android
 * 3. npm run build && npx cap add android && npx cap sync android
 * 4. npx cap open android → Build APK
 *
 * Guía completa: CAPACITOR-ANDROID.md
 */
const config: CapacitorConfig = {
  appId: "com.bancavictoria.app",
  appName: "Banca Victoria",
  webDir: "dist/public",
  server: {
    // TODO: pon aquí tu URL de Render, ejemplo:
    // url: "https://banca-victoria-v30.onrender.com",
    url: "https://TU-APP.onrender.com",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
