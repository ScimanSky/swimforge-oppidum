/**
 * Security Middleware
 * 
 * Implementa:
 * - Rate Limiting (semplificato per compatibilità)
 * - CORS Configuration
 * - Security Headers
 */

import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { createRedisStore } from '../lib/redis-rate-limit-store';
import { logger } from "./logger";
import { createOriginGuard, isOriginAllowed, parseAllowedOrigins } from "./origins";

const log = logger.child({ component: "security" });

function parseCspList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

const supabaseOrigin = toOrigin(process.env.SUPABASE_URL);
const imagekitEndpointOrigin = toOrigin(process.env.IMAGEKIT_URL_ENDPOINT);
const cloudinaryResOrigin = toOrigin(process.env.CLOUDINARY_CLOUD_NAME ? `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}` : undefined);
const extraConnectSrc = parseCspList(process.env.CSP_CONNECT_SRC_EXTRA);
const extraImgSrc = parseCspList(process.env.CSP_IMG_SRC_EXTRA);
const extraMediaSrc = parseCspList(process.env.CSP_MEDIA_SRC_EXTRA);

// ============================================================================
// RATE LIMITING - SEMPLIFICATO
// ============================================================================

/**
 * Rate limiter per endpoint di login
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 10, // 10 tentativi
  message: {
    error: 'Too Many Attempts',
    message: 'Troppi tentativi di login. Riprova tra 15 minuti.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore({ prefix: 'rl:login:', windowMs: 15 * 60 * 1000 }),
});

/**
 * Rate limiter per endpoint di registrazione
 */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 ora
  max: 3, // 3 registrazioni per ora
  message: {
    error: 'Too Many Registrations',
    message: 'Troppi tentativi di registrazione. Riprova tra 1 ora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore({ prefix: 'rl:registration:', windowMs: 60 * 60 * 1000 }),
});

/**
 * Rate limiter generico per API
 */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 200, // 200 richieste per minuto
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Hai superato il limite di richieste. Riprova tra 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    return req.path === '/health' || req.path === '/health/deep' || req.path === '/ready' || req.path === '/status';
  },
  store: createRedisStore({ prefix: 'rl:api:', windowMs: 1 * 60 * 1000 }),
});

/**
 * Rate limiter per Garmin sync
 */
export const garminSyncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minuti
  max: 5, // 5 sincronizzazioni ogni 5 minuti
  message: {
    error: 'Sync Rate Limit',
    message: 'Troppi tentativi di sincronizzazione. Riprova tra 5 minuti.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore({ prefix: 'rl:garmin:', windowMs: 5 * 60 * 1000 }),
});

/**
 * Rate limiter per AI Coach
 */
export const aiCoachLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 ora
  max: 10, // 10 richieste all'ora
  message: {
    error: 'AI Coach Rate Limit',
    message: 'Limite giornaliero di richieste AI raggiunto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore({ prefix: 'rl:ai:', windowMs: 60 * 60 * 1000 }),
});

/**
 * Rate limiter per sync endpoints (Garmin)
 */
export const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minuti
  max: 5, // 5 richieste ogni 5 minuti
  message: {
    error: 'Sync Rate Limit',
    message: 'Troppi tentativi di sincronizzazione. Riprova tra 5 minuti.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore({ prefix: 'rl:sync:', windowMs: 5 * 60 * 1000 }),
});

/**
 * Rate limiter per commenti community
 */
export const commentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // 20 commenti al minuto
  message: {
    error: 'Comment Rate Limit',
    message: 'Troppi commenti. Riprova tra 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore({ prefix: 'rl:comment:', windowMs: 1 * 60 * 1000 }),
});

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

/**
 * CORS options - Configurazione esplicita
 */
const getAllowedOrigins = () => parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

export const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Never raise here: disallowed origins are answered with 403 by `originGuard`
    // (mounted before cors); `false` just omits the CORS headers.
    callback(null, isOriginAllowed(origin, getAllowedOrigins(), process.env.NODE_ENV === "production"));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-csrf-token', 'x-swimforge-client'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Number', 'RateLimit-Remaining'],
  maxAge: 86400,
};

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Helmet configuration
 */
export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: uniq([
        "'self'",
        'data:',
        'blob:',
        supabaseOrigin,
        'https://*.supabase.co',
        imagekitEndpointOrigin,
        'https://ik.imagekit.io',
        cloudinaryResOrigin,
        'https://res.cloudinary.com',
        'https://avatars.githubusercontent.com',
        'https://lh3.googleusercontent.com',
        'https://*.googleusercontent.com',
        'https://secure.gravatar.com',
        'https://*.gravatar.com',
        'https://*.tile.openstreetmap.org',
        ...extraImgSrc,
      ]),
      mediaSrc: uniq([
        "'self'",
        'blob:',
        'data:',
        supabaseOrigin,
        'https://*.supabase.co',
        imagekitEndpointOrigin,
        'https://ik.imagekit.io',
        cloudinaryResOrigin,
        'https://res.cloudinary.com',
        ...extraMediaSrc,
      ]),
      connectSrc: uniq([
        "'self'",
        'https://api.garmin.com',
        'https://nominatim.openstreetmap.org',
        supabaseOrigin,
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://upload.imagekit.io',
        'https://api.cloudinary.com',
        imagekitEndpointOrigin,
        ...extraConnectSrc,
      ]),
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", 'https://www.openstreetmap.org'],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' } as any,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  // The Android app runs at https://app.swimforge.it (Capacitor WebView) and loads
  // images and other static files from https://swimforge.it: same-site, different
  // origin. Helmet's default (`same-origin`) would block those embeds.
  crossOriginResourcePolicy: { policy: 'same-site' } as const,
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
};

// ============================================================================
// CUSTOM SECURITY MIDDLEWARE
// ============================================================================

/**
 * 403 JSON per le origini non ammesse (preflight incluso), senza stack nei log
 */
export const originGuard = createOriginGuard({
  getAllowedOrigins,
  onReject: ({ origin, method, path }) => {
    log.warn('[SECURITY] Origin not allowed', {
      event: "security:origin_not_allowed",
      origin,
      method,
      path,
    });
  },
});

/**
 * Middleware per validare user agent
 */
export function userAgentValidation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userAgent = req.headers['user-agent'] || '';
  const suspiciousAgents = ['sqlmap', 'nikto', 'nmap', 'masscan', 'nessus'];

  if (suspiciousAgents.some((agent) => userAgent.toLowerCase().includes(agent))) {
    log.warn('[SECURITY] Suspicious user agent detected', {
      event: "security:suspicious_user_agent",
      ip: req.ip,
      userAgent,
    });

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Accesso negato',
    });
  }

  next();
}

/**
 * Middleware per limitare dimensione payload
 */
export function payloadSizeLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const configuredMaxSize = Number.parseInt(process.env.MAX_REQUEST_BYTES ?? '', 10);
  const maxSize = Number.isFinite(configuredMaxSize) && configuredMaxSize > 0
    ? configuredMaxSize
    : 5 * 1024 * 1024; // 5 MB default
  const contentLength = parseInt(req.headers['content-length'] || '0');

  if (contentLength > maxSize) {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `Payload massimo: ${maxSize / 1024 / 1024} MB`,
    });
  }

  next();
}

// ============================================================================
// MIDDLEWARE COMPOSITION
// ============================================================================

/**
 * Applica tutti i security middleware
 */
export function applySecurityMiddleware() {
  return [
    helmet(helmetConfig as any),
    originGuard,
    cors(corsOptions),
    userAgentValidation,
    payloadSizeLimit,
  ];
}

/**
 * Applica rate limiting globale
 */
export function applyRateLimiting() {
  return [apiLimiter];
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  loginLimiter,
  registrationLimiter,
  apiLimiter,
  garminSyncLimiter,
  aiCoachLimiter,
  syncLimiter,
  commentLimiter,
  corsOptions,
  helmetConfig,
  originGuard,
  userAgentValidation,
  payloadSizeLimit,
  applySecurityMiddleware,
  applyRateLimiting,
};
