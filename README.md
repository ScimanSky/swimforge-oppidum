# SwimForge Oppidum

SwimForge Oppidum is a social + analytics web app for swimmers.
It combines training tracking, social feed/clubs, and AI coach features.

## Stack
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + tRPC
- Database: PostgreSQL (Supabase recommended)
- ORM/Migrations: Drizzle
- Integrations: Garmin service, Gemini, ImageKit, Cloudinary

## Core Features
- Activity tracking (pool/open-water) with share-to-feed flow
- Social feed, reactions, comments, direct messages, clubs
- XP, badges, and personal records
- AI coach chat and AI-generated insights

## Local Development

Prerequisites:
- Node.js 22+
- pnpm
- PostgreSQL (local or Supabase)

Setup:
```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Quality gates:
```bash
pnpm check
pnpm test
```

Database migrations:
```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate
```

Migration policy:
- Canonical migration chain: `drizzle/0000_*.sql` ... `drizzle/00xx_*.sql`
- Drizzle metadata must stay aligned (`drizzle/meta/_journal.json` + latest `*_snapshot.json`) and is validated via `pnpm db:validate`.
- Legacy/manual SQL scripts are archived in `db/legacy-sql/` and are **not** part of the default migrate flow.

Optional demo seed:
- `docs/sample-data/seed.sql`

## App Android
App Android `it.swimforge.app` (Capacitor 8) che incapsula la stessa web app. Guida completa: `docs/ANDROID_APP.md`.

Prerequisiti: Node 22, JDK 21, Android SDK 36, `.env.native` (da `.env.native.example`) e `android/app/google-services.json` (progetto Firebase `swimforge-oppidum`, app `it.swimforge.app`; non versionato).

```bash
pnpm android:build   # vite build --mode native + rimozione immagini pesanti + cap sync + gradlew assembleDebug
pnpm android:sync    # solo cap sync android
pnpm android:open    # apre il progetto in Android Studio
adb install -r android/app/build/outputs/apk/debug/app-debug.apk   # APK ~20 MB
```

Nell'app l'API (`VITE_API_BASE_URL`) e le immagini pesanti (`/images`, `/profile_badges`, `/badges_new`, `/videos`, `VITE_ASSET_BASE_URL`) sono caricate da `https://swimforge.it`; l'origin del WebView e' `https://app.swimforge.it`.

## Monorepo Layout
- `client/`: UI and pages
- `server/`: API and business logic
- `drizzle/`: schema and SQL migrations
- `shared/`: shared constants/types
- `garmin-service/`: Python microservice for Garmin sync

## Operations
- Deploy guide: `DEPLOYMENT.md`
- Deploy Oracle (produzione): `docs/ORACLE_DEPLOYMENT.md`
- App Android: `docs/ANDROID_APP.md`
- Self-hosting: `docs/SELF_HOST.md`
- SwimForge 2.0 guide: `docs/SWIMFORGE_2_0_GUIDE.md`
- Security policy: `SECURITY.md`
- Contribution flow: `CONTRIBUTING.md`

## License
Apache-2.0
