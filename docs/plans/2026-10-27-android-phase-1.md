# Fase 1 — Guscio Android con Capacitor: piano di implementazione

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produrre l'APK Android di SwimForge (Capacitor 8) con login email e Google, rete verso il backend Oracle, token nativo persistente, notifiche push FCM per DM, interazioni social, sync Garmin e PB, senza cambiare il comportamento del sito web.

**Architecture:** Branch `android/phase-1` (da `main` aea2b43). Il client React resta uno solo: le differenze native passano da `isNativePlatform()` e da variabili Vite della modalità `native`. Il guscio Capacitor vive in `android/` nel repo. Il server aggiunge solo CORS, tabella `device_tokens`, router `push` e il modulo di invio. Design approvato: `docs/plans/2026-10-27-android-phase-1-design.md`.

**Tech Stack:** Capacitor 8.5 (`core`, `android`, `cli`, `app`, `browser`, `preferences`, `push-notifications`, `status-bar`, `splash-screen`, `keyboard`, `share`, `@capacitor/assets`), Android SDK 36 + JDK 21 (`JAVA_HOME=/home/scima/.local/share/contiamici-toolchain/jdk-21.0.11+10`, `ANDROID_HOME=/home/scima/Android/Sdk`), firebase-admin (server), Supabase Auth PKCE, vitest.

**Verifica sempre dalla root:** `pnpm check`, `pnpm lint` (28 warning preesistenti), `pnpm test` (45 file / 235 test di partenza), `pnpm build`. **Push:** `git push git@github.com:ScimanSky/swimforge-oppidum.git android/phase-1`. Mai `main` (deploya). Mai `pnpm db:migrate`/`db:push`.

---

## Task 1: URL base dell'API e modalità Vite `native`
**Files:** create `client/src/lib/api-base.ts` + test; modify `client/src/main.tsx` (url del link), ogni `fetch("/api/...")` nel client (grep `"/api/` in `client/src`), `vite.config.ts` solo se `envDir` va reso esplicito; create `client/.env.native.example` (o root, dove Vite legge gli env: verificare `envDir`) con `VITE_API_BASE_URL=https://swimforge.it` e le stesse `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` del web (chiave anon pubblica); `.gitignore` per `.env.native`.
- `apiUrl(path)`: con `VITE_API_BASE_URL` vuoto restituisce `path` invariato (web identico a oggi); con base impostata restituisce `base + path` senza doppie barre.
- Test: 4 casi (vuoto, con base, base con slash finale, path senza slash iniziale).
- Script `package.json`: `"build:native": "vite build --mode native"`.
- Commit `feat(client): api base url for native builds`.

## Task 2: Capacitor e progetto Android
**Files:** `package.json` (dipendenze), `capacitor.config.ts`, `android/` (generato da `npx cap add android`), `assets/icon.png` + `assets/splash.png` (1024×1024 e 2732×2732, dal logo `client/public/icon.svg` o `swimforge-logo.png`: generarli con uno script Node usando `sharp`, già dipendenza), `.gitignore` (output Gradle, `android/app/google-services.json`, `.env.native`), script `android:build` e `android:open`.
- `capacitor.config.ts`: appId `it.swimforge.app`, appName `SwimForge`, webDir uguale all'`outDir` di Vite (`dist/public`), `server: { hostname: "app.swimforge.it", androidScheme: "https" }`, `plugins: { SplashScreen: { launchAutoHide: false }, StatusBar: { style: "DARK", overlaysWebView: false }, PushNotifications: { presentationOptions: ["badge","sound","alert"] } }`.
- `npx @capacitor/assets generate --android --iconBackgroundColor '#0A1520' --splashBackgroundColor '#0A1520'`.
- `AndroidManifest.xml`: intent-filter per lo schema `swimforge` (host `auth`, path `/callback`) sull'activity principale; `android:launchMode="singleTask"`.
- Build di prova: `pnpm build:native && npx cap sync android && cd android && JAVA_HOME=... ANDROID_HOME=... ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`. Riportare dimensione e durata.
- Commit `feat(android): capacitor shell with android project, icons and splash` (il progetto `android/` è versionato; verificare che `.gitignore` escluda `android/app/build`, `android/.gradle`, `android/build`, `android/local.properties`).

## Task 3: Runtime nativo (token su Preferences, deep link, tasto Indietro, splash)
**Files:** create `client/src/lib/native-runtime.ts` (+ test per le funzioni pure), `client/src/lib/deep-links.ts` (+ test), modify `client/src/lib/session-token.ts` (+ test), `client/src/main.tsx`, `client/src/App.tsx` (hook di init).
- `session-token.ts`: cache in memoria + `@capacitor/preferences` su nativo (`loadNativeSessionToken()` async chiamata all'avvio prima del render; `set/clear` aggiornano cache e Preferences); sul web resta `localStorage`; migrazione una tantum dalla chiave `swimforge:nativeSessionToken` in localStorage a Preferences.
- `deep-links.ts`: `resolveDeepLink(url) → { kind: "auth-callback", code } | { kind: "route", path } | null` per `swimforge://auth/callback?code=...`, `https://swimforge.it/<path>`, `https://www.swimforge.it/<path>`; test con 6 casi.
- `native-runtime.ts`: `initNativeRuntime(navigate)` solo su nativo: StatusBar stile scuro, `SplashScreen.hide()` dopo il primo render, `App.addListener("backButton")` (history.back se possibile, altrimenti `App.exitApp()` solo sulla home), `App.addListener("appUrlOpen")` → `resolveDeepLink` → auth callback (Task 4) o `navigate(path)`.
- Commit `feat(client): native runtime (preferences token, deep links, back button, splash)`.

## Task 4: Login Google nativo e sync condivisa
**Files:** create `client/src/lib/auth-sync.ts` (+ test con tRPC mock), modify `Login.tsx`, `Register.tsx`, `AuthCallback.tsx`, `native-runtime.ts`.
- `auth-sync.ts`: `syncSupabaseSession(session)` che chiama `auth.syncSupabaseUser` e salva il token nativo quando presente (sostituisce i tre handler duplicati della fase 0).
- Google su nativo: `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "swimforge://auth/callback", skipBrowserRedirect: true } })` → `Browser.open({ url: data.url })`. In `appUrlOpen` con `kind: "auth-callback"`: `Browser.close()`, `supabase.auth.exchangeCodeForSession(code)`, `syncSupabaseSession`, navigate `/home`. Errori → toast.
- Web invariato (`redirectTo: ${origin}/auth/callback`).
- Prerequisito esterno (proprietario o Management API): `swimforge://auth/callback` negli Additional Redirect URLs di Supabase. Documentare in `docs/ORACLE_DEPLOYMENT.md` o README android.
- Commit `feat(auth): native Google sign-in via custom tab and deep link`.

## Task 5: CORS per l'app e risposta 403
**Files:** `server/middleware/security.ts` (+ test della funzione pura `isOriginAllowed(origin, list, env)` da estrarre), `server/_core/index.ts` o il gestore errori (CORS error → 403 JSON `{ error: "origin_not_allowed" }`), `.env.oracle.example`, `docs/ORACLE_DEPLOYMENT.md`.
- Default origini: aggiungere `https://app.swimforge.it`; rimuovere `https://localhost` e `capacitor://localhost` (non più necessari con l'hostname dedicato).
- Commit `feat(server): allow the app origin and answer 403 to disallowed origins`.

## Task 6: Push lato server
**Files:** `drizzle/schema.ts` (+ migrazione `0034_add_device_tokens` via `pnpm db:generate --name add_device_tokens`), create `server/db_device_tokens.ts`, `server/push.ts` (+ test con `firebase-admin` mockato), `server/routers/push.router.ts` (+ test), modify `server/routers/index.ts`, `server/_core/env.ts` (`firebaseServiceAccountJson` da `FIREBASE_SERVICE_ACCOUNT_JSON` base64, opzionale: senza, `sendPushToUser` è un no-op con warning all'avvio), `server/db_social_enhanced.ts` (`createNotification` → `sendPushToUser` per i tipi reaction/comment/mention con titolo/corpo italiani e `data.url`), `server/db_social_enhanced.ts` `sendDirectMessage` → push al destinatario (titolo = nome mittente, corpo = anteprima, url `/messages`), `server/garmin.ts` fine sync con N nuove attività → push (`/track`), rilevamento PB (`server/garmin.ts` ~1101+) → push (`/profile`), `package.json` (`firebase-admin`), `.env.oracle.example`, `docs/ORACLE_DEPLOYMENT.md`.
- `device_tokens`: id serial, user_id int not null, token varchar(512) unique not null, platform varchar(16) not null, app_version varchar(32), created_at, last_seen_at; indice su user_id.
- `push.router`: `register({ token, platform, appVersion? })` upsert sull'utente corrente; `unregister({ token })`.
- `sendPushToUser(userId, { title, body, url })`: `sendEachForMulticast` sui token dell'utente; token con errore `registration-token-not-registered` eliminati; mai lanciare verso il chiamante (log + return).
- Hook: rispettare le preferenze notifiche esistenti dell'utente se presenti (`notificationSettings`); non inviare a sé stessi.
- Test: router (mock db), `push.ts` (mock admin: invio, pulizia token invalidi, no-op senza config), un test di hook (createNotification chiama sendPushToUser con url corretta).
- Commit `feat(push): device tokens, FCM sender and notification hooks`.

## Task 7: Push lato client
**Files:** create `client/src/lib/push.ts` (+ test delle parti pure: payload → url), modify `native-runtime.ts`, `auth-sync.ts` (dopo login su nativo → `registerPushToken()`), i percorsi di logout (deregistrazione), `App.tsx`.
- Su nativo: `PushNotifications.requestPermissions()` → `register()` → listener `registration` → `trpc.push.register`; `registrationError` → log; `pushNotificationReceived` (foreground) → toast con titolo/corpo; `pushNotificationActionPerformed` → `navigate(data.url ?? "/home")`.
- Commit `feat(client): push registration and notification handling on native`.

## Task 8: Firebase e service account (eseguito dal coordinatore, fuori dagli agenti)
- `firebase apps:create android it.swimforge.app --project swimforge-oppidum`, `firebase apps:sdkconfig android <appId>` → `android/app/google-services.json` (non versionato).
- Service account `swimforge-push@swimforge-oppidum.iam.gserviceaccount.com` con ruolo `roles/firebasecloudmessaging.admin` (o `roles/firebase.sdkAdminServiceAgent` se richiesto da firebase-admin), chiave JSON → base64 in `/home/scima/.local/share/swimforge/firebase-service-account.b64` (0600) per `.env.oracle`.

## Task 9: Build, installazione sul Pixel e smoke test
- `pnpm android:build`; copia dell'APK in una cartella Windows e `adb.exe -P 5038 install -r`; avvio; screenshot via adb delle schermate: login, feed, post, messaggi, impostazioni.
- Checklist del gate (design §6) eseguita con il proprietario; esiti e screenshot in `docs/plans/2026-10-27-android-phase-1-smoke.md`.

## Task 10: Documentazione e chiusura
- `README.md` sezione "App Android" (prerequisiti, `pnpm android:build`, installazione, `.env.native`, `google-services.json`); `docs/ORACLE_DEPLOYMENT.md` (`FIREBASE_SERVICE_ACCOUNT_JSON`, `ALLOWED_ORIGINS` con `https://app.swimforge.it`, redirect Supabase); `docs/ANDROID_APP_PLAN.md` Fase 1 completata con data; PR verso `main`.
- Gate di rilascio: migrazione 0034 applicata in produzione con riga di tracking (come 0033); env Oracle aggiornato PRIMA del merge; dopo il deploy `/ready` e una push di prova.
