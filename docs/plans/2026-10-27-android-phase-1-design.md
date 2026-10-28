# Fase 1 — Guscio Android con Capacitor: design (27 ottobre 2026)

Stato: **approvato dal proprietario il 27/10/2026** (identità `it.swimforge.app`, nome "SwimForge",
schema deep link `swimforge://`; push: messaggi diretti, commenti/reazioni/menzioni, sync Garmin
completata, nuovo record personale). Contesto: `docs/ANDROID_APP_PLAN.md` §5 Fase 1.

## Obiettivo
Un'app Android installabile sul Pixel 8a che esegue la stessa web app React dentro un guscio
Capacitor 8, contro lo stesso backend su Oracle: login email e Google, feed, post con foto,
messaggi, sync Garmin, notifiche push. Nessuna modifica di prodotto: la home resta il feed
(la home "Oggi" è della fase 3).

## 1. Identità e guscio
- Capacitor 8.5 (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`), progetto `android/`
  versionato nel repo (build output ignorati).
- `capacitor.config.ts`: `appId: "it.swimforge.app"`, `appName: "SwimForge"`, `webDir` = output
  di Vite, `server.hostname: "app.swimforge.it"`, `server.androidScheme: "https"` → l'origine
  del WebView è `https://app.swimforge.it` (servita localmente dal guscio, nessun DNS
  necessario) invece del generico `https://localhost`.
- Icona e splash generati con `@capacitor/assets` dal logo esistente.
- Plugin: App (deep link, tasto Indietro), Browser (OAuth in Custom Tab), Preferences (token),
  PushNotifications, StatusBar, SplashScreen, Keyboard, Share.

## 2. Rete
- Il client chiama oggi `/api/trpc` in relativo. Nel build nativo l'URL è assoluto:
  `VITE_API_BASE_URL=https://swimforge.it` (modalità Vite `native`), helper `apiUrl(path)`
  usato dal link tRPC e da ogni altra fetch verso `/api/...`.
- Token di sessione nativo: da `localStorage` a `@capacitor/preferences`, con cache in memoria
  caricata all'avvio prima di montare il provider tRPC; migrazione una tantum della chiave
  localStorage della fase 0.
- Server: `https://app.swimforge.it` nelle origini CORS di default; `ALLOWED_ORIGINS` sull'host
  Oracle va aggiornato (origine pubblica sempre per prima). Le origini non ammesse ricevono
  403 JSON invece di 500.

## 3. Login
- Email e password: già pronto (token nativo della fase 0).
- Google: su nativo `signInWithOAuth({ provider: "google", options: { redirectTo:
  "swimforge://auth/callback", skipBrowserRedirect: true } })`, apertura di `data.url` con il
  plugin Browser, ritorno via `appUrlOpen`, `exchangeCodeForSession(code)` (PKCE), poi la
  stessa sync con il server usata dal web (`syncSupabaseUser` con header nativo). La logica
  di sync esce da `AuthCallback.tsx` in un modulo condiviso.
- Prerequisito Supabase: `swimforge://auth/callback` tra gli "Additional Redirect URLs"
  (azione del proprietario nella dashboard, o via Management API se disponibile).
- Strava in app: rinviato (fase 5).

## 4. Push
- Firebase: progetto `swimforge-oppidum` (già creato), app Android registrata con
  `it.swimforge.app`, `google-services.json` in `android/app/` (non versionato: contiene
  identificatori del progetto), service account con ruolo FCM e chiave JSON in
  `.env.oracle` come `FIREBASE_SERVICE_ACCOUNT_JSON` (base64).
- Repo: migrazione `0034_add_device_tokens` (`device_tokens`: id, user_id, token unique,
  platform, app_version, created_at, last_seen_at); `server/push.ts` (firebase-admin,
  `sendPushToUser`, pulizia dei token non più validi); router `push.register/unregister`
  (protetti); invio agganciato a `createNotification` (reazioni, commenti, menzioni),
  `sendDirectMessage`, fine sync Garmin con nuove attività, rilevamento PB. Payload `data.url`
  per aprire la schermata giusta al tap.
- Client (solo nativo): dopo il login richiesta permesso e registrazione del token; al logout
  deregistrazione; notifica in foreground mostrata come toast; tap → navigazione a `data.url`.

## 5. Build e distribuzione
- Script: `pnpm android:build` = `vite build --mode native` → `cap sync android` →
  `gradlew assembleDebug`; APK debug installata sul Pixel via adb (dal lato Windows:
  `adb.exe -P 5038 install -r`).
- Play Console, keystore di rilascio e App Links verificati: fase successiva con il
  proprietario.

## 6. Verifica
- Test unitari per tutto ciò che è puro: `apiUrl`, mapping dei deep link, cache del token,
  router `push`, `sendPushToUser` con firebase-admin mockato, hook di invio.
- Gate sul Pixel: login email e Google, feed, post con foto dalla fotocamera, DM ricevuto
  come push a app chiusa, sync Garmin, logout. Screenshot via adb per la documentazione.
- Web invariata: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` verdi; CI verde sulla PR.
