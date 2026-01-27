/**
 * Centralized Logging System
 * 
 * Implementa:
 * - Winston Logger per file logging
 * - Sentry per error tracking (opzionale)
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
 * Inizializza Sentry per error tracking (opzionale)
 */
export function initSentry() {
  // Solo se SENTRY_DSN è configurato
  if (!process.env.SENTRY_DSN) {
    console.log('[Logger] Sentry DSN non configurato, skipping initialization');
    return;
  }

  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
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
    console.log('[Logger] Sentry initialized successfully');
  } catch (error) {
    console.warn('[Logger] Failed to initialize Sentry:', error);
  }
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
      // Console output
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),

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
        maxFiles: 10,
      }),
    ],
  });

  return logger;
}

// Crea istanza globale del logger
export const logger = createLogger();

// ============================================================================
// REQUEST LOGGING
// ============================================================================

/**
 * Middleware per loggare richieste HTTP
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();

  // Log richiesta in ingresso
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Intercetta response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log risposta
    logger.info('Outgoing response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });

    // Segnala se richiesta è lenta
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
      });
    }

    return originalSend.call(this, data);
  };

  next();
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Middleware per gestire errori
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log errore
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500,
    message: err.message,
    stack: err.stack,
    ip: req.ip,
  });

  // Invia a Sentry se configurato
  if (process.env.SENTRY_DSN) {
    try {
      Sentry.captureException(err);
    } catch (sentryError) {
      console.warn('[Logger] Failed to send error to Sentry:', sentryError);
    }
  }

  // Risposta al client
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal Server Error',
    statusCode: err.statusCode || 500,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log azioni critiche per audit trail
 */
export function auditLog(
  action: string,
  userId: number | string | undefined,
  details: Record<string, any>
) {
  logger.info(`[AUDIT] ${action}`, {
    userId,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

/**
 * Monitora performance di operazioni critiche
 */
export function performanceMonitor(
  operationName: string,
  duration: number,
  metadata: Record<string, any> = {}
) {
  if (duration > 1000) {
    logger.warn(`[PERFORMANCE] Slow operation: ${operationName}`, {
      duration: `${duration}ms`,
      ...metadata,
    });
  } else {
    logger.debug(`[PERFORMANCE] ${operationName}`, {
      duration: `${duration}ms`,
      ...metadata,
    });
  }
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
  auditLog,
  performanceMonitor,
};
