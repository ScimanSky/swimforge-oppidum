/**
 * Security Middleware
 * 
 * Implementa:
 * - Rate Limiting
 * - CORS Configuration
 * - Security Headers
 * - CSRF Protection
 */

import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Rate limiter per endpoint di login
 * Protegge da brute force attacks
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 5, // 5 tentativi
  message: {
    error: 'Too Many Attempts',
    message: 'Troppi tentativi di login. Riprova tra 15 minuti.',
  },
  standardHeaders: true, // Ritorna info in `RateLimit-*` headers
  legacyHeaders: false, // Disabilita `X-RateLimit-*` headers
  skip: (req) => {
    // Skip per IP admin
    return req.ip === process.env.ADMIN_IP;
  },
  keyGenerator: (req) => {
    // Usa email come chiave se disponibile, altrimenti IP
    return req.body?.email || req.ip || 'unknown';
  },
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
  keyGenerator: (req) => req.ip || 'unknown',
});

/**
 * Rate limiter generico per API
 * Applica a tutti gli endpoint
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
  skip: (req) => {
    // Skip per endpoint pubblici non critici
    return req.path === '/health' || req.path === '/status';
  },
});

/**
 * Rate limiter per Garmin sync
 * Limita sincronizzazioni frequenti
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
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
});

/**
 * Rate limiter per AI Coach
 * Limita richieste all'API Gemini
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
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
});

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

/**
 * CORS options - Configurazione esplicita
 * 
 * SICUREZZA:
 * - NON usa wildcard (*)
 * - Specifica solo domini necessari
 * - Usa HTTPS
 * - Limita metodi HTTP
 */
export const corsOptions: cors.CorsOptions = {
  // Origini consentite
  origin: (origin, callback) => {
    const allowedOrigins = (
      process.env.ALLOWED_ORIGINS || 'https://swimforge-frontend.onrender.com'
    ).split(',');

    // Consenti richieste senza origin (mobile, desktop)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    }
  },

  // Consenti credenziali (cookies, authorization headers)
  credentials: true,

  // Metodi HTTP consentiti
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Headers consentiti
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],

  // Headers esposti al client
  exposedHeaders: ['X-Total-Count', 'X-Page-Number', 'RateLimit-Remaining'],

  // Max age della preflight cache (in secondi)
  maxAge: 86400, // 24 ore
};

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Helmet configuration - Imposta security headers
 * 
 * Headers implementati:
 * - X-Content-Type-Options: nosniff (previene MIME sniffing)
 * - X-Frame-Options: DENY (previene clickjacking)
 * - X-XSS-Protection: 1; mode=block (XSS protection)
 * - Strict-Transport-Security: HSTS (forza HTTPS)
 * - Content-Security-Policy: CSP (previene XSS/injection)
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'api.garmin.com', 'api.strava.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000, // 1 anno
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
});

// ============================================================================
// CSRF PROTECTION
// ============================================================================

/**
 * CSRF token generator
 * Genera token unico per ogni sessione
 */
export function generateCsrfToken(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF validation middleware
 * Valida CSRF token su richieste POST/PUT/DELETE
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Salta validazione per GET/HEAD/OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Ottieni token dal header o body
  const token = req.headers['x-csrf-token'] || req.body?._csrf;

  if (!token) {
    return res.status(403).json({
      error: 'CSRF Validation Failed',
      message: 'CSRF token mancante',
    });
  }

  // Valida token (implementazione semplificata)
  // In produzione, usa una libreria come csurf
  if (token !== req.session?.csrfToken) {
    return res.status(403).json({
      error: 'CSRF Validation Failed',
      message: 'CSRF token non valido',
    });
  }

  next();
}

// ============================================================================
// CUSTOM SECURITY MIDDLEWARE
// ============================================================================

/**
 * Middleware per loggare richieste sospette
 */
export function suspiciousRequestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Controlla per pattern di SQL injection
  const sqlInjectionPatterns = [
    /(\bOR\b|\bAND\b|\bUNION\b|\bSELECT\b|\bDROP\b|\bINSERT\b)/i,
    /['";]/,
  ];

  const bodyStr = JSON.stringify(req.body);
  const queryStr = JSON.stringify(req.query);

  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(bodyStr) || pattern.test(queryStr)) {
      console.warn('[SECURITY] Suspicious SQL pattern detected', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
      });
      break;
    }
  }

  next();
}

/**
 * Middleware per validare user agent
 * Blocca bot e client sospetti
 */
export function userAgentValidation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userAgent = req.headers['user-agent'] || '';

  // Lista di user agent sospetti
  const suspiciousAgents = [
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'nessus',
  ];

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
 * 
 * @example
 * app.use(applySecurityMiddleware());
 */
export function applySecurityMiddleware() {
  return [
    helmet(helmetConfig),
    cors(corsOptions),
    userAgentValidation,
    suspiciousRequestLogger,
    payloadSizeLimit,
  ];
}

/**
 * Applica rate limiting globale
 * 
 * @example
 * app.use(applyRateLimiting());
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
  generateCsrfToken,
  csrfProtection,
  suspiciousRequestLogger,
  userAgentValidation,
  payloadSizeLimit,
  applySecurityMiddleware,
  applyRateLimiting,
};
