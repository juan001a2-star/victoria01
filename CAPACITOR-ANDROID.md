# Banca Victoria → App Android instalable (NO PWA, sin Play Store)

La app nativa abre tu sitio de Render dentro de un contenedor Android real.
Se instala con un archivo `.apk`. No es PWA ni TWA.

## Requisitos en tu PC

1. **Node.js 20+**
2. **Android Studio** (incluye SDK y herramientas)
   - https://developer.android.com/studio
3. Al instalar Android Studio, marca:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device (opcional)

4. Variable de entorno (Windows PowerShell ejemplo):
```powershell
# Ajusta la ruta si tu SDK está en otro sitio
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
```

En Linux/Mac:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

---

## Paso 1 — Descomprime el proyecto

Usa la carpeta `app` del ZIP (donde está `package.json`).

```bash
cd app
npm install
```

---

## Paso 2 — Pon la URL de tu servidor (Render)

Edita (o crea) el archivo `.env` en `app/`:

```env
VITE_APP_URL=https://TU-APP.onrender.com
```

Sustituye por la URL real de Render.

---

## Paso 3 — Instalar Capacitor

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Banca Victoria" "com.bancavictoria.app" --web-dir dist/public
```

Si `cap init` pregunta y ya existe config, puedes saltarlo y usar el `capacitor.config.ts` del proyecto.

---

## Paso 4 — Configurar Capacitor

Archivo `capacitor.config.ts` en la raíz de `app/`:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bancavictoria.app',
  appName: 'Banca Victoria',
  webDir: 'dist/public',
  server: {
    // La app carga tu backend+frontend de Render (app real, no PWA)
    url: 'https://TU-APP.onrender.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

**Importante:** cambia `https://TU-APP.onrender.com` por tu URL real.

---

## Paso 5 — Añadir plataforma Android

```bash
# Hace falta un build web mínimo para que exista webDir
npm run build

npx cap add android
npx cap sync android
```

---

## Paso 6 — Abrir en Android Studio y generar el APK

```bash
npx cap open android
```

En Android Studio:

1. Espera a que termine de indexar / Gradle Sync  
2. Menú **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
3. Cuando termine, clic en **locate**  
4. El archivo suele estar en:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Paso 7 — Instalar en el teléfono

1. Copia `app-debug.apk` al teléfono (USB, WhatsApp, Drive, etc.)  
2. Ábrelo en el teléfono  
3. Si pide permiso: **Permitir instalar apps de esta fuente**  
4. Instalar  

Ya aparece **Banca Victoria** como app normal (icono, pantalla completa, no es el navegador).

---

## Actualizar la app después de cambios

Si solo cambias el backend/frontend en Render y la app apunta a esa URL:

- **No hace falta** nuevo APK: al abrir la app ya carga la versión nueva del servidor.

Si cambias nombre, icono o config nativa:

```bash
npx cap sync android
npx cap open android
# Build → Build APK(s) otra vez
```

---

## Icono de la app (opcional)

1. Prepara un PNG 1024×1024  
2. En Android Studio: clic derecho en `android/app` → **New → Image Asset**  
3. Elige tu imagen → Next → Finish  
4. Vuelve a generar el APK  

---

## Resumen

| Qué | Detalle |
|-----|---------|
| ¿Es PWA? | No |
| ¿Es TWA? | No |
| ¿Hay que publicar en Play Store? | No |
| ¿Qué instala el usuario? | Archivo `.apk` |
| ¿Dónde vive el programa? | Sigue en Render; la app es el contenedor nativo |

