# Drizzle Metadata Notes

Canonical Drizzle metadata for PostgreSQL is stored in:

- `drizzle/meta/_journal.json`
- latest `drizzle/meta/*_snapshot.json` (currently `0032_snapshot.json`)

Historical MySQL snapshots are archived in:

- `drizzle/meta_legacy_mysql/`

Do not place non-JSON files or subdirectories inside `drizzle/meta/` because `drizzle-kit check` attempts to parse all entries in that folder.
