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
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// WINSTON LOGGER
// ============================================================================

/**
 * Crea logger Winston
 */
export function createLogger() {
  const enableFileLogging =
    process.env.ENABLE_FILE_LOGGING === 'true' || process.env.NODE_ENV !== 'production';
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Skip logging if message is empty or [object Object]
      let finalMessage = message;
      if (typeof message === 'object' && message !== null) {
        finalMessage = JSON.stringify(message);
        // Skip if empty object
        if (finalMessage === '{}') {
          return ''; // Skip this log entry
        }
      }
      
      // Skip if message is [object Object] or empty string
      if (finalMessage === '[object Object]' || finalMessage === '' || !finalMessage) {
        return ''; // Skip this log entry
      }
      
      return JSON.stringify({
        timestamp,
        level,
        message: finalMessage,
        ...meta,
      });
    })
  );

  const fileTransports = enableFileLogging
    ? [
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        }),
        new winston.transports.File({
          filename: 'logs/audit.log',
          level: 'info',
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        }),
      ]
    : [];

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
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            // Se message è un oggetto, serializzalo correttamente
            let msg: string;
            if (typeof message === 'object' && message !== null) {
              msg = JSON.stringify(message);
            } else {
              msg = String(message || '');
            }
            
            // Se ci sono metadati significativi, aggiungili
            const metaStr = Object.keys(meta).length > 0 
              ? ` ${JSON.stringify(meta)}` 
              : '';
            
            return `${level}: ${msg}${metaStr}`;
          })
        ),
      }),
      ...fileTransports,
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
  // Skip logging per path non significativi
  const SKIP_PATHS = ['/favicon.ico', '/health', '/ready', '/status', '/robots.txt'];
  const SKIP_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2', '.map'];
  
  if (SKIP_PATHS.includes(req.path) || SKIP_EXTENSIONS.some(ext => req.path.endsWith(ext))) {
    return next();
  }

  const startTime = Date.now();

  // Intercetta response per loggare con statusCode e durata
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log unico per richiesta (con status e durata)
    logger.info('Request completed', {
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
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log errore (skip if no actual error message)
  const errRec = (typeof err === "object" && err !== null) ? (err as Record<string, unknown>) : null;
  const errorMessage =
    err instanceof Error
      ? err.message
      : (typeof errRec?.["message"] === "string" ? (errRec["message"] as string) : String(err));
  if (!errorMessage || errorMessage === '[object Object]' || errorMessage === '{}') {
    // Don't log empty errors but still propagate to next handler
    next(err);
    return;
  }
  
  const statusCode = typeof errRec?.["statusCode"] === "number" ? (errRec["statusCode"] as number) : 500;

  logger.error(`Request error: ${req.method} ${req.path} - ${errorMessage}`, {
    event: 'request:error',
    statusCode,
    stack: err instanceof Error ? err.stack : (typeof errRec?.["stack"] === "string" ? (errRec["stack"] as string) : undefined),
    ip: req.ip,
  });

  // Rollbar error tracking (if configured)
  if (process.env.ROLLBAR_ACCESS_TOKEN) {
    try {
      // Rollbar will be called by the middleware in index.ts
    } catch (rollbarError) {
      const message =
        rollbarError instanceof Error ? rollbarError.message : String(rollbarError);
      logger.warn("[Logger] Failed to send error to Rollbar", {
        event: "rollbar:send_failed",
        message,
      });
    }
  }

  const clientErrorMessage = statusCode >= 500 ? "Internal Server Error" : errorMessage;

  // Risposta al client
  res.status(statusCode).json({
    error: clientErrorMessage,
    statusCode,
    ...(process.env.NODE_ENV === 'development' && { stack: err instanceof Error ? err.stack : errRec?.["stack"] }),
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
  details: Record<string, unknown>
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
  createLogger,
  logger,
  requestLogger,
  errorHandler,
  auditLog,
  performanceMonitor,
};
