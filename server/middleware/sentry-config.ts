import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";

/**
 * Initialize Sentry for error tracking and performance monitoring
 * 
 * Configuration:
 * - Error tracking: Captures all unhandled exceptions
 * - Performance monitoring: Tracks transaction performance
 * - Release tracking: Identifies which version caused issues
 * - Environment: Separates production from staging errors
 */
export function initializeSentry() {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn("[Sentry] SENTRY_DSN not configured. Error tracking disabled.");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "production",
    release: process.env.APP_VERSION || "unknown",
    
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    
    // Integrations
    integrations: [
      new ProfilingIntegration(),
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
    
    // Ignore known non-critical errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      // Random plugins/extensions
      "chrome-extension://",
      "moz-extension://",
      // See http://blog.errorception.com/2012/03/tale-of-unfindable-js-error.html
      "originalCreateNotification",
      "canvas.contentDocument",
      "MyApp_RemoveAllHighlights",
      // Network errors (often not actionable)
      "NetworkError",
      "Network request failed",
      "Failed to fetch",
    ],
    
    // Before sending to Sentry
    beforeSend(event, hint) {
      // Filter out certain errors
      if (event.exception) {
        const error = hint.originalException;
        
        // Ignore 404 errors
        if (error instanceof Error && error.message.includes("404")) {
          return null;
        }
        
        // Ignore CORS errors (usually not actionable)
        if (error instanceof Error && error.message.includes("CORS")) {
          return null;
        }
      }
      
      return event;
    },
  });

  console.log("[Sentry] Initialized successfully");
}

/**
 * Capture a message with context
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" | "debug" = "info",
  context?: Record<string, any>
) {
  if (context) {
    Sentry.captureMessage(message, level);
    Sentry.setContext("custom", context);
  } else {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Capture an exception with context
 */
export function captureException(
  error: Error,
  context?: Record<string, any>
) {
  if (context) {
    Sentry.setContext("custom", context);
  }
  Sentry.captureException(error);
}

/**
 * Set user context for error tracking
 */
export function setUserContext(userId: string, email?: string, username?: string) {
  Sentry.setUser({
    id: userId,
    email,
    username,
  });
}

/**
 * Clear user context
 */
export function clearUserContext() {
  Sentry.setUser(null);
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  op: string = "http.server"
) {
  return Sentry.startTransaction({
    name,
    op,
  });
}
