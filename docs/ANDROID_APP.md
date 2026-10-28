# SwimForge Android (Capacitor)

App Android `it.swimforge.app`: la stessa web app React dentro un guscio Capacitor 8 (`android/`,
`capacitor.config.ts`). Piano e design: `docs/plans/2026-10-27-android-phase-1*.md`.

## Build

- `.env.native` (non versionato, modello in `.env.native.example`): `VITE_API_BASE_URL` e
  `VITE_ASSET_BASE_URL` = `https://swimforge.it` (origine assoluta), stesse
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` del web.
- `pnpm build:native` (Vite in modalità `native` + rimozione delle cartelle pesanti caricate
  dal sito), poi `pnpm android:build` per l'APK debug
  (`android/app/build/outputs/apk/debug/app-debug.apk`).

## Prerequisiti esterni

### Supabase: redirect URL del login Google
Il login Google nativo apre l'OAuth in una Custom Tab con
`redirectTo: "swimforge://auth/callback"` (PKCE) e torna nell'app tramite il deep link
(intent-filter in `android/app/src/main/AndroidManifest.xml`, gestito da
`client/src/lib/native-runtime.ts` e `client/src/lib/native-auth.ts`).

Supabase accetta solo redirect in lista, quindi una volta per progetto:
**Supabase Dashboard → Authentication → URL Configuration → Additional Redirect URLs →
aggiungere `swimforge://auth/callback`.**

Senza questa voce Supabase ignora il `redirectTo` e rimanda al Site URL (il sito web): il login
Google nell'app non torna nell'app. Il login email/password non ne ha bisogno.

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
