# Structured Logging Guide

## 📊 Logging Architecture

### Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| **ERROR** | Critical failures | Database connection failed |
| **WARN** | Warnings, potential issues | Rate limit exceeded |
| **INFO** | Important events | User login, activity created |
| **DEBUG** | Detailed debugging | Query execution time |
| **TRACE** | Very detailed info | Function entry/exit |

---

## 🛠️ Implementation

### 1. Structured Logger

```typescript
// server/lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: {
    service: 'swimforge-backend',
    environment: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Structured logging helper
export function logEvent(event: string, data: any, level: string = 'info') {
  logger[level]({
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
}
```

### 2. Request/Response Logging

```typescript
// server/middleware/request-logging.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Log request
  logger.info({
    event: 'request:start',
    method: req.method,
    path: req.path,
    query: req.query,
    userId: req.user?.id,
    ip: req.ip,
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info({
      event: 'request:end',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
    });
    
    // Alert on slow requests
    if (duration > 1000) {
      logger.warn({
        event: 'slow_request',
        method: req.method,
        path: req.path,
        duration,
        threshold: 1000,
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}
```

### 3. Database Query Logging

```typescript
// server/lib/query-logger.ts
import { logger } from './logger';

export function logDatabaseQuery(
  query: string,
  params: any[],
  duration: number,
  rowCount?: number
) {
  const level = duration > 500 ? 'warn' : 'debug';
  
  logger[level]({
    event: 'database:query',
    query: query.substring(0, 200), // Truncate long queries
    paramCount: params.length,
    duration,
    rowCount,
    slow: duration > 500,
  });
}
```

### 4. Error Logging with Stack Traces

```typescript
// server/middleware/error-logging.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import * as Sentry from '@sentry/node';

export function errorLoggingMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error({
    event: 'error:unhandled',
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    statusCode: res.statusCode,
  });
  
  // Send to Sentry
  Sentry.captureException(err, {
    contexts: {
      request: {
        method: req.method,
        path: req.path,
        query: req.query,
      },
    },
  });
  
  res.status(500).json({
    error: 'Internal Server Error',
    requestId: req.id,
  });
}
```

### 5. Performance Monitoring

```typescript
// server/lib/performance-logger.ts
import { logger } from './logger';

export class PerformanceMonitor {
  private startTime: number;
  private name: string;
  
  constructor(name: string) {
    this.name = name;
    this.startTime = Date.now();
  }
  
  end(metadata?: any) {
    const duration = Date.now() - this.startTime;
    
    logger.debug({
      event: 'performance',
      name: this.name,
      duration,
      ...metadata,
    });
    
    return duration;
  }
}

// Usage
const monitor = new PerformanceMonitor('leaderboard_query');
const leaderboard = await fetchLeaderboard();
monitor.end({ rowCount: leaderboard.length });
```

### 6. Audit Logging

```typescript
// server/lib/audit-logger.ts
import { logger } from './logger';

export function logAuditEvent(
  action: string,
  userId: number,
  resource: string,
  resourceId: string,
  changes?: any
) {
  logger.info({
    event: 'audit',
    action,
    userId,
    resource,
    resourceId,
    changes,
    timestamp: new Date().toISOString(),
  });
}

// Usage
logAuditEvent('create', userId, 'activity', activityId, {
  distance: 1000,
  duration: 1800,
});

logAuditEvent('update', userId, 'profile', profileId, {
  level: { old: 5, new: 6 },
  totalXp: { old: 5000, new: 6000 },
});

logAuditEvent('delete', userId, 'activity', activityId);
```

---

## 📈 Log Aggregation

### Structured Log Format

```json
{
  "timestamp": "2026-01-27T11:02:49.123Z",
  "level": "info",
  "event": "request:end",
  "service": "swimforge-backend",
  "environment": "production",
  "method": "GET",
  "path": "/api/leaderboard",
  "statusCode": 200,
  "duration": 245,
  "userId": 123,
  "ip": "192.168.1.1"
}
```

### Log Queries (ELK Stack)

```
# Find slow requests
event:request:end AND duration:[500 TO *]

# Find errors by user
event:error AND userId:123

# Find database queries > 1 second
event:database:query AND duration:[1000 TO *]

# Find audit events
event:audit AND action:delete
```

---

## 🔍 Monitoring Queries

### Error Rate
```
Count of events where level=error / Total events * 100
```

### P95 Response Time
```
95th percentile of duration where event=request:end
```

### Database Query Performance
```
Average duration where event=database:query
```

### User Activity
```
Count of events where userId=X grouped by event
```

---

## 🚀 Integration

```typescript
// server/index.ts
import express from 'express';
import { requestLoggingMiddleware } from './middleware/request-logging';
import { errorLoggingMiddleware } from './middleware/error-logging';
import { initSentry } from './lib/logger';

const app = express();

// Initialize Sentry
initSentry();

// Add logging middleware
app.use(requestLoggingMiddleware);

// ... routes ...

// Error handling
app.use(errorLoggingMiddleware);
```

---

## 📊 Log Retention

- **Error logs**: 90 days
- **Combined logs**: 30 days
- **Audit logs**: 1 year
- **Performance logs**: 7 days

---

## 🎯 Best Practices

1. **Use structured logging** - JSON format for easy parsing
2. **Include context** - User ID, request ID, resource ID
3. **Log at appropriate levels** - Don't spam with DEBUG in production
4. **Include timestamps** - For correlation and debugging
5. **Avoid sensitive data** - Don't log passwords, tokens, PII
6. **Use correlation IDs** - Track requests across services
7. **Monitor log volume** - Alert on unusual spikes

---

**Expected Benefit: 10x faster debugging & issue resolution**
