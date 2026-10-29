/** Supabase Auth error codes worth their own Italian message (the SDK's messages are English). */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o password non corretti.",
  email_not_confirmed: "Conferma prima l'email: apri il link che ti abbiamo inviato.",
  user_already_exists: "Esiste già un account con questa email: accedi.",
  email_exists: "Esiste già un account con questa email: accedi.",
  email_address_invalid: "Questo indirizzo email non è valido.",
  weak_password: "Password troppo debole: usane una più lunga, con lettere e numeri.",
  same_password: "La nuova password deve essere diversa da quella attuale.",
  over_email_send_rate_limit: "Troppe email inviate: riprova tra qualche minuto.",
  over_request_rate_limit: "Troppi tentativi: riprova tra qualche minuto.",
  signup_disabled: "Le registrazioni sono chiuse in questo momento.",
  user_banned: "Questo account è sospeso.",
  otp_expired: "Il link è scaduto: richiedine uno nuovo.",
  flow_state_expired: "Il link è scaduto: richiedine uno nuovo.",
  session_not_found: "Il link non è più valido: richiedine uno nuovo.",
  session_expired: "Il link non è più valido: richiedine uno nuovo.",
};

/** Older Auth servers answer without a code: their English messages, matched loosely. */
const BY_MESSAGE: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "invalid_credentials"],
  [/email not confirmed/i, "email_not_confirmed"],
  [/user already registered/i, "user_already_exists"],
  [/rate limit/i, "over_request_rate_limit"],
];

/**
 * Italian text for a Supabase Auth error (sign-in, sign-up, password reset): a known code gets
 * its own message, anything else `fallback`. The SDK's English message is never shown.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  const shaped = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown;
    message?: unknown;
  };
  const code = typeof shaped.code === "string" ? shaped.code : "";
  if (MESSAGES[code]) return MESSAGES[code];
  const message = typeof shaped.message === "string" ? shaped.message : "";
  const matched = BY_MESSAGE.find(([pattern]) => pattern.test(message))?.[1];
  return matched ? MESSAGES[matched] : fallback;
}

/** A plausible email address (the server has the last word): something@domain.tld. */
export const isPlausibleEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Minimum password length asked by the sign-up and reset forms. */
export const MIN_PASSWORD_LENGTH = 8;
