# Naming Conventions

## TypeScript/JavaScript

- Variables and functions: `camelCase` (e.g. `getUserById`)
- Classes, types, interfaces, enums: `PascalCase` (e.g. `UserService`)
- Constants: `UPPER_SNAKE_CASE` (e.g. `MAX_RETRY_COUNT`)
- Private/internal fields: leading underscore allowed (e.g. `_internalCache`)

## Database (Drizzle)

- Table names (DB): `snake_case` (e.g. `swimmer_profiles`)
- Column names (DB): `snake_case` (e.g. `created_at`)
- Column names in TS (Drizzle schema): `camelCase` (e.g. `createdAt`)
- Foreign keys (DB): `${table}_id` (e.g. `user_id`)

## API Payloads

- Prefer `camelCase` in TypeScript types.
- When reading external APIs or legacy payloads that use `snake_case`, keep the raw payload as-is but map to internal `camelCase` types at module boundaries.

