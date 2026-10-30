export const COOKIE_NAME = "app_session_id";
export const CSRF_COOKIE_NAME = "csrf_token";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
export const CSRF_ERR_MSG = 'CSRF validation failed';
/** The database is unreachable: shown to the user (Italian), whatever the error code. */
export const DB_UNAVAILABLE_ERR_MSG = "Servizio momentaneamente non disponibile, riprova tra poco.";
/** Longest text of a feed post or a shared swim. */
export const POST_CONTENT_MAX_LENGTH = 2000;
/** Longest text of a club post (created or edited). */
export const CLUB_POST_CONTENT_MAX_LENGTH = 1000;
