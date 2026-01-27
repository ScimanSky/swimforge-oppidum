/**
 * Security Audit Logging Middleware
 * 
 * Tracks all access to sensitive tables:
 * - strava_tokens (credentials)
 * - user_achievement_badges (user data)
 * - ai_insights_cache (user data)
 * - ai_coach_workouts (user data)
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { securityAuditLog } from '../db/schema';
import { logger } from '../lib/logger';

/**
 * Log security-relevant actions
 */
export async function logSecurityEvent(
  userId: string,
  action: string,
  tableName: string,
  resourceId?: string,
  req?: Request
) {
  try {
    await db.insert(securityAuditLog).values({
      userId: userId as any,
      action,
      tableName,
      resourceId,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
      createdAt: new Date(),
    });

    logger.info({
      event: 'security:audit',
      action,
      userId,
      tableName,
      resourceId,
      ip: req?.ip,
    });
  } catch (error) {
    logger.error({
      event: 'security:audit_failed',
      action,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Detect anomalous access patterns
 */
export async function detectAnomalousAccess(
  userId: string,
  action: string,
  tableName: string
): Promise<boolean> {
  try {
    // Get last 10 accesses by this user to this table
    const recentAccess = await db.query.securityAuditLog.findMany({
      where: (log, { eq, and }) =>
        and(
          eq(log.userId, userId as any),
          eq(log.tableName, tableName)
        ),
      orderBy: (log) => log.createdAt,
      limit: 10,
    });

    if (recentAccess.length < 5) {
      return false; // Not enough data to detect anomaly
    }

    // Calculate average time between accesses
    const timeDiffs: number[] = [];
    for (let i = 1; i < recentAccess.length; i++) {
      const diff = recentAccess[i].createdAt.getTime() - 
                   recentAccess[i - 1].createdAt.getTime();
      timeDiffs.push(diff);
    }

    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    const lastTimeDiff = recentAccess[recentAccess.length - 1].createdAt.getTime() -
                        new Date().getTime();

    // Alert if access is 10x faster than average (potential attack)
    if (Math.abs(lastTimeDiff) < avgTimeDiff / 10) {
      logger.warn({
        event: 'security:anomalous_access',
        userId,
        tableName,
        action,
        avgTimeDiff,
        lastTimeDiff,
      });
      return true;
    }

    return false;
  } catch (error) {
    logger.error({
      event: 'security:anomaly_detection_failed',
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Middleware to audit sensitive table access
 */
export function auditSensitiveAccess(
  tableName: string,
  action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Log the access
    await logSecurityEvent(userId, action, tableName, undefined, req);

    // Detect anomalies
    const isAnomalous = await detectAnomalousAccess(userId, action, tableName);

    if (isAnomalous) {
      // Still allow access but flag as suspicious
      res.set('X-Security-Alert', 'Anomalous access detected');
    }

    next();
  };
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 100,
  offset: number = 0
) {
  try {
    const logs = await db.query.securityAuditLog.findMany({
      where: (log, { eq }) => eq(log.userId, userId as any),
      orderBy: (log) => log.createdAt,
      limit,
      offset,
    });

    return logs;
  } catch (error) {
    logger.error({
      event: 'security:get_audit_logs_failed',
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Alert on suspicious activity
 */
export async function checkSuspiciousActivity(userId: string) {
  try {
    // Get access count in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentAccess = await db.query.securityAuditLog.findMany({
      where: (log, { eq, and, gte }) =>
        and(
          eq(log.userId, userId as any),
          gte(log.createdAt, oneHourAgo)
        ),
    });

    // Alert if more than 100 accesses in 1 hour
    if (recentAccess.length > 100) {
      logger.error({
        event: 'security:suspicious_activity',
        userId,
        accessCount: recentAccess.length,
        timeWindow: '1 hour',
      });

      return {
        suspicious: true,
        reason: 'Too many accesses in short time',
        accessCount: recentAccess.length,
      };
    }

    // Check for access to strava_tokens
    const stravaAccess = recentAccess.filter(
      (log) => log.tableName === 'strava_tokens'
    );

    if (stravaAccess.length > 10) {
      logger.warn({
        event: 'security:excessive_strava_access',
        userId,
        accessCount: stravaAccess.length,
      });

      return {
        suspicious: true,
        reason: 'Excessive access to Strava tokens',
        accessCount: stravaAccess.length,
      };
    }

    return { suspicious: false };
  } catch (error) {
    logger.error({
      event: 'security:check_suspicious_failed',
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { suspicious: false };
  }
}
