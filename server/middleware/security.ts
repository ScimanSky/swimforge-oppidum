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

// ============================================================================
// RATE LIMITING - SEMPLIFICATO
// ============================================================================

/**
 * Rate limiter per endpoint di login
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 5, // 5 tentativi
  message: {
    error: 'Too Many Attempts',
    message: 'Troppi tentativi di login. Riprova tra 15 minuti.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => {
    return req.ip === process.env.ADMIN_IP;
  },
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
  max: 100, // 100 richieste per minuto
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Hai superato il limite di richieste. Riprova tra 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => {
    return req.path === '/health' || req.path === '/status';
  },
  store: createRedisStore({ prefix: 'rl:api:', windowMs: 1 * 60 * 1000 }),
});

/**
 * Rate limiter per Garmin sync
 */
export const garminSyncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minuti
  max: 2, // 2 sincronizzazioni ogni 5 minuti
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

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

/**
 * CORS options - Configurazione esplicita
 */
export const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = (
      process.env.ALLOWED_ORIGINS || 'https://swimforge-frontend.onrender.com'
    )
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
      scriptSrc: ["'self'", 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'api.garmin.com',
        'api.strava.com',
        'https://sentry.io',
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wpnxaadvyxmhlcgdobla.supabase.co',
        'https://*.supabase.co',
      ].filter(Boolean),
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' } as any,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
};

// ============================================================================
// CUSTOM SECURITY MIDDLEWARE
// ============================================================================

/**
 * Middleware per loggare richieste sospette
 * 
 * Detecta pattern sospetti in richieste non-API (evita falsi positivi su tRPC).
 */
export function suspiciousRequestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip tRPC and known API paths to avoid false positives
  if (req.path.startsWith('/api/trpc') || req.path.startsWith('/health') || req.path.startsWith('/status')) {
    return next();
  }

  const suspiciousPatterns = [
    /(\bunion\b.*\bselect\b)/i,
    /(\bdrop\b.*\btable\b)/i,
    /(\bdelete\b.*\bfrom\b)/i,
    /(--|;).*(\bdrop\b|\bdelete\b|\binsert\b|\bupdate\b)/i,
    /('.*\bor\b.*'.*=.*')/i,
    /<script\b/i,
  ];

  const fullUrl = req.originalUrl || req.url;
  // Handle both string and object bodies; skip large bodies to avoid performance overhead
  let body = '';
  if (typeof req.body === 'string') {
    body = req.body.length <= 10000 ? req.body : '';
  } else if (req.body) {
    try { body = JSON.stringify(req.body).slice(0, 10000); } catch { body = ''; }
  }

  const isSuspicious = suspiciousPatterns.some(
    (pattern) => pattern.test(fullUrl) || pattern.test(body)
  );

  if (isSuspicious) {
    console.warn('[SECURITY] Suspicious request detected', {
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
    });
  }

  next();
}

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
    console.warn('[SECURITY] Suspicious user agent detected', {
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
  const maxSize = 1024 * 1024; // 1 MB
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
    cors(corsOptions),
    suspiciousRequestLogger,
    userAgentValidation,
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
  corsOptions,
  helmetConfig,
  suspiciousRequestLogger,
  userAgentValidation,
  payloadSizeLimit,
  applySecurityMiddleware,
  applyRateLimiting,
};
