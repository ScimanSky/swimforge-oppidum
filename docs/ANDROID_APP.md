# SwimForge Android (Capacitor)

App Android `it.swimforge.app`: la stessa web app React dentro un guscio Capacitor 8 (`android/`,
`capacitor.config.ts`). Piano e design: `docs/plans/2026-10-27-android-phase-1*.md`.

## Identità

- `appId` `it.swimforge.app`, nome "SwimForge", schema deep link `swimforge://`; callback OAuth
  esatta `swimforge://auth/callback`.
- Origin del WebView `https://app.swimforge.it` (`server.hostname` in `capacitor.config.ts`,
  schema https servito dal guscio); deve stare in `ALLOWED_ORIGINS` sul server.
- L'app punta solo alla produzione (`https://swimforge.it`).

## Build

- Prerequisiti: Node 22, JDK 21, Android SDK 36, `android/app/google-services.json` (Firebase
  `swimforge-oppidum`, non versionato).
- `.env.native` (non versionato, modello in `.env.native.example`): `VITE_API_BASE_URL` e
  `VITE_ASSET_BASE_URL` = `https://swimforge.it` (origine assoluta; le immagini pesanti
  `/images`, `/profile_badges`, `/badges_new`, `/videos` sono tolte dall'APK e caricate dal sito),
  `VITE_PUBLIC_SITE_URL` = `https://swimforge.it` (link che escono dall'app), stesse
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` del web.
- `pnpm build:native` (Vite in modalità `native` + rimozione delle cartelle pesanti caricate
  dal sito), poi `pnpm android:build` per l'APK debug
  (`android/app/build/outputs/apk/debug/app-debug.apk`, ~20 MB; `adb install -r`).
  `pnpm android:build` esegue tutti i passi (build nativa, `cap sync`, `gradlew assembleDebug`);
  `pnpm android:sync` e `pnpm android:open` per sync e Android Studio.

## Prerequisiti esterni

### Supabase: redirect URL del login Google
Il login Google nativo apre l'OAuth in una Custom Tab con
`redirectTo: "swimforge://auth/callback"` (PKCE) e torna nell'app tramite il deep link
(intent-filter in `android/app/src/main/AndroidManifest.xml`, gestito da
`client/src/lib/native-runtime.ts` e `client/src/lib/native-auth.ts`).

Supabase accetta solo redirect in lista, quindi una volta per progetto:
**Supabase Dashboard → Authentication → URL Configuration → Additional Redirect URLs →
aggiungere `swimforge://auth/callback`.**

Flusso: Custom Tab (plugin Browser) → Google → Supabase → `swimforge://auth/callback?code=…` →
`exchangeCodeForSession` (PKCE) → sync con il server.

Senza questa voce Supabase ignora il `redirectTo` e rimanda al Site URL (il sito web): il login
Google nell'app non torna nell'app. Il login email/password non ne ha bisogno.

### Link nelle email
Conferma email e reset password puntano al sito pubblico (`VITE_PUBLIC_SITE_URL`, default
`https://swimforge.it`), non all'app: si aprono nel browser.

## Notifiche push (FCM)

- Canale Android `default`. Il server invia con `firebase-admin` (`FIREBASE_SERVICE_ACCOUNT_JSON`,
  vedi `docs/ORACLE_DEPLOYMENT.md`; migrazione `0034_add_device_tokens`).
- Tipi: reazione, commento, menzione, `club_workout_published`, messaggi diretti, riepilogo
  sync Garmin, nuovo record personale. Gli altri tipi restano solo in-app; l'autore dell'azione
  non riceve la propria push.
- Il token FCM si registra dopo il login e a ogni avvio dell'app; si deregistra al logout. I
  token non validi sono eliminati dal server.
- In foreground la notifica e' mostrata come toast in-app; il tap apre `data.url`.

## Tasto Indietro

Torna indietro nella cronologia; esce dall'app dalla home (`/home`) o se non c'e' cronologia.

## Sessione nativa

- Il token di sessione del server (`auth.syncSupabaseUser` con header nativo) è salvato con
  `@capacitor/preferences` (chiave `nativeSessionToken`, file `CapacitorStorage`) e tenuto in
  memoria; viene caricato prima del primo render (`client/src/main.tsx`).
- Backup Android disattivati (`allowBackup="false"`, `backup_rules.xml`,
  `data_extraction_rules.xml`): né il token né lo storage del WebView (sessione Supabase,
  verifier PKCE) finiscono nei backup cloud o nel trasferimento tra dispositivi.

## Deep link

| URL | Azione |
| --- | --- |
| `swimforge://auth/callback?code=…` (path esatto; `error` / `error_description` se l'OAuth fallisce) | completa il login Google |
| `https://swimforge.it/<path>`, `https://www.swimforge.it/<path>` | apre `<path>?<query>` nell'app |

Oggi il manifest registra solo lo schema `swimforge://`; i link `https://swimforge.it` arrivano
all'app solo dopo gli App Links verificati (fase successiva).

## Limiti noti

- App Links https non ancora verificati: i link del sito si aprono nel browser.
- Collegamento Strava non disponibile nell'app (si usa il sito); rinviato a una fase successiva.
- L'app punta solo alla produzione; nessun selettore di ambiente.
- Solo APK debug; keystore di rilascio e Play Console sono fasi successive.

## Distribuzione ai tester (Firebase App Distribution)

Prerequisiti una tantum: API App Distribution abilitata sul progetto `swimforge-oppidum`,
gruppo tester `owner` con gli indirizzi dei tester, CLI Firebase autenticata
(`npx firebase-tools login`).

```bash
pnpm android:distribute            # bump versionCode, build, upload al gruppo "owner"
pnpm android:distribute -- --no-build   # carica l'APK già compilato
pnpm android:distribute -- --group beta --notes "testo note"
```

Lo script incrementa `versionCode` in `android/app/build.gradle` (il `versionName` diventa
`<versione package.json>.<versionCode>`), compila l'APK di debug, lo carica e manda ai
tester l'email con il link. Sul telefono i tester installano l'app "App Tester" di Firebase
o aprono il link dall'email. Committare il bump di versione insieme al rilascio.
