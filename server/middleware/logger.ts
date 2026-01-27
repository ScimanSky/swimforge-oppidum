/**
 * Centralized Logging System
 * 
 * Implementa:
 * - Winston Logger per file logging
 * - Sentry per error tracking
 * - Audit logging per azioni critiche
 * - Performance monitoring
 */

import winston from 'winston';
import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// SENTRY INITIALIZATION
// ============================================================================

/**
 * Inizializza Sentry per error tracking
 */
export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({
        request: true,
        serverName: true,
        transaction: true,
      }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
    beforeSend(event, hint) {
      // Filtra errori non critici
      if (event.exception) {
        const error = hint.originalException;
        
        // Non tracciare errori di validazione
        if (error instanceof Error && error.message.includes('Validation')) {
          return null;
        }
      }

      return event;
    },
  });
}

// ============================================================================
// WINSTON LOGGER
// ============================================================================

/**
 * Crea logger Winston
 */
export function createLogger() {
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta,
      });
    })
  );

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
      service: 'swimforge-backend',
      environment: process.env.NODE_ENV,
    },
    transports: [
      // Error log file
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 10,
      }),

      // Combined log file
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 10485760, // 10MB
        maxFiles: 10,
      }),

      // Audit log file
      new winston.transports.File({
        filename: 'logs/audit.log',
        level: 'info',
        maxsize: 10485760, // 10MB
        maxFiles: 30, // Mantieni 30 giorni
      }),
    ],
  });

  // Aggiungi console transport in development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      })
    );
  }

  return logger;
}

export const logger = createLogger();

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================

/**
 * Middleware per loggare tutte le richieste HTTP
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || generateRequestId();

  // Aggiungi requestId al logger context
  (req as any).requestId = requestId;

  // Loga richiesta
  logger.info('Incoming Request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: (req as any).user?.id,
  });

  // Intercetta response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - start;

    // Loga risposta
    logger.info('Outgoing Response', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length'),
      userId: (req as any).user?.id,
    });

    // Chiama send originale
    return originalSend.call(this, data);
  };

  next();
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Loga errori critici
 */
export function logError(
  error: Error,
  context: Record<string, any> = {}
) {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  });

  // Invia a Sentry
  Sentry.captureException(error, {
    contexts: {
      application: context,
    },
  });
}

/**
 * Middleware per error handling
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = (req as any).requestId;

  logger.error('Request Error', {
    requestId,
    method: req.method,
    path: req.path,
    status: res.statusCode,
    error: err.message,
    stack: err.stack,
    userId: (req as any).user?.id,
  });

  // Invia a Sentry
  Sentry.captureException(err, {
    tags: {
      requestId,
      path: req.path,
    },
  });

  // Rispondi con errore generico (non esporre dettagli)
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Si è verificato un errore interno',
    requestId, // Utile per debugging
  });
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Loga azioni critiche per compliance
 */
export function auditLog(
  action: string,
  userId: string | null,
  details: Record<string, any> = {},
  severity: 'info' | 'warning' | 'critical' = 'info'
) {
  logger.info('Audit Log', {
    type: 'AUDIT',
    action,
    userId,
    severity,
    details,
    timestamp: new Date().toISOString(),
  });

  // Invia a Sentry se critical
  if (severity === 'critical') {
    Sentry.captureMessage(`Audit: ${action}`, 'warning', {
      contexts: {
        audit: {
          userId,
          details,
        },
      },
    });
  }
}

/**
 * Loga accessi utente
 */
export function logUserLogin(userId: string, method: string, ip: string) {
  auditLog('USER_LOGIN', userId, { method, ip }, 'info');
}

/**
 * Loga logout utente
 */
export function logUserLogout(userId: string) {
  auditLog('USER_LOGOUT', userId, {}, 'info');
}

/**
 * Loga accesso non autorizzato
 */
export function logUnauthorizedAccess(userId: string | null, resource: string) {
  auditLog('UNAUTHORIZED_ACCESS', userId, { resource }, 'warning');
}

/**
 * Loga modifica dati sensibili
 */
export function logSensitiveDataChange(
  userId: string,
  dataType: string,
  changes: Record<string, any>
) {
  auditLog('SENSITIVE_DATA_CHANGE', userId, { dataType, changes }, 'critical');
}

/**
 * Loga sincronizzazione Garmin
 */
export function logGarminSync(userId: string, status: 'success' | 'failure', details: any) {
  auditLog('GARMIN_SYNC', userId, { status, details }, 'info');
}

/**
 * Loga richiesta AI Coach
 */
export function logAiCoachRequest(userId: string, workoutType: string) {
  auditLog('AI_COACH_REQUEST', userId, { workoutType }, 'info');
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

/**
 * Loga query database lente
 */
export function logSlowQuery(query: string, duration: number, threshold: number = 1000) {
  if (duration > threshold) {
    logger.warn('Slow Database Query', {
      query: query.substring(0, 200), // Limita lunghezza
      duration: `${duration}ms`,
      threshold: `${threshold}ms`,
    });

    // Invia a Sentry
    Sentry.captureMessage('Slow Query Detected', 'warning', {
      contexts: {
        database: {
          duration,
          threshold,
        },
      },
    });
  }
}

/**
 * Loga API call lenta
 */
export function logSlowApiCall(
  service: string,
  endpoint: string,
  duration: number,
  threshold: number = 5000
) {
  if (duration > threshold) {
    logger.warn('Slow API Call', {
      service,
      endpoint,
      duration: `${duration}ms`,
      threshold: `${threshold}ms`,
    });
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Genera unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Formatta log per leggibilità
 */
export function formatLog(data: Record<string, any>): string {
  return JSON.stringify(data, null, 2);
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  initSentry,
  createLogger,
  logger,
  requestLogger,
  errorHandler,
  logError,
  auditLog,
  logUserLogin,
  logUserLogout,
  logUnauthorizedAccess,
  logSensitiveDataChange,
  logGarminSync,
  logAiCoachRequest,
  logSlowQuery,
  logSlowApiCall,
  generateRequestId,
  formatLog,
};
