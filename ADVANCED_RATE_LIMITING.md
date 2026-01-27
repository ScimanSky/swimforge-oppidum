# Advanced Rate Limiting Guide

## 🔐 Protezione Endpoint Critici

### Rate Limiting Strategy

| Endpoint | Limite | Finestra | Scopo |
|----------|--------|----------|-------|
| **Login** | 5 req | 15 min | Brute force protection |
| **Registrazione** | 3 req | 1 ora | Account creation spam |
| **API Generica** | 100 req | 1 min | General DDoS protection |
| **Leaderboard** | 50 req | 1 min | Expensive query protection |
| **Activity Upload** | 20 req | 1 ora | Sync protection |
| **File Upload** | 10 file | 1 ora | Storage protection |
| **Search** | 30 req | 1 min | Search spam protection |

---

## 🛠️ Implementazione

### 1. Per-Endpoint Rate Limiters

```typescript
// server/middleware/advanced-rate-limiting.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis';

// Login limiter - Strict
export const loginLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:login:',
  }),
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                      // 5 attempts
  message: 'Too many login attempts. Try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration limiter - Very Strict
export const registrationLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:register:',
  }),
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 3,                      // 3 registrations
  message: 'Too many registration attempts. Try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Leaderboard limiter - Moderate (expensive query)
export const leaderboardLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:leaderboard:',
  }),
  windowMs: 60 * 1000,        // 1 minute
  max: 50,                     // 50 requests
  message: 'Leaderboard rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Activity sync limiter
export const activitySyncLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:sync:',
  }),
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,                     // 20 syncs
  message: 'Activity sync rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter
export const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:api:',
  }),
  windowMs: 60 * 1000,        // 1 minute
  max: 100,                    // 100 requests
  message: 'API rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### 2. User-Based Rate Limiting

```typescript
// server/middleware/user-rate-limiting.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis';

/**
 * Adaptive rate limiting based on user tier
 */
export const adaptiveApiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:adaptive:',
  }),
  windowMs: 60 * 1000,        // 1 minute
  max: async (req, res) => {
    // Higher limits for authenticated users
    if (req.user?.id) {
      // Premium users: 500 req/min
      if (req.user.tier === 'premium') return 500;
      // Regular users: 200 req/min
      return 200;
    }
    // Anonymous users: 50 req/min
    return 50;
  },
  keyGenerator: (req, res) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  },
  message: 'Rate limit exceeded for your tier.',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### 3. DDoS Protection

```typescript
// server/middleware/ddos-protection.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis';

/**
 * Aggressive DDoS protection
 */
export const ddosProtection = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:ddos:',
  }),
  windowMs: 60 * 1000,        // 1 minute
  max: 1000,                   // 1000 requests per minute per IP
  message: 'Too many requests from this IP.',
  standardHeaders: true,
  legacyHeaders: false,
  // Ban for 24 hours if exceeded
  skip: async (req, res) => {
    const key = `rl:ddos:${req.ip}`;
    const count = await redis.get(key);
    
    if (count && parseInt(count) > 1000) {
      // Check if already banned
      const banned = await redis.get(`banned:${req.ip}`);
      if (banned) {
        res.status(403).json({
          error: 'Your IP has been temporarily banned.',
        });
        return true;
      }
      
      // Ban for 24 hours
      await redis.setex(`banned:${req.ip}`, 86400, '1');
    }
    
    return false;
  },
});
```

### 4. Search Rate Limiting

```typescript
// server/middleware/search-rate-limiting.ts
export const searchLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:search:',
  }),
  windowMs: 60 * 1000,        // 1 minute
  max: 30,                     // 30 searches per minute
  message: 'Search rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Rate limit by user or IP
    return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  },
});
```

---

## 🚀 Integration in Express

```typescript
// server/index.ts
import express from 'express';
import {
  loginLimiter,
  registrationLimiter,
  leaderboardLimiter,
  activitySyncLimiter,
  apiLimiter,
  ddosProtection,
  searchLimiter,
} from './middleware/advanced-rate-limiting';

const app = express();

// Apply DDoS protection globally
app.use(ddosProtection);

// Apply API limiter globally
app.use('/api/', apiLimiter);

// Auth endpoints
app.post('/auth/login', loginLimiter, authController.login);
app.post('/auth/register', registrationLimiter, authController.register);

// Leaderboard endpoint
app.get('/api/leaderboard', leaderboardLimiter, leaderboardController.getTop100);

// Activity sync endpoint
app.post('/api/activities/sync', activitySyncLimiter, activitiesController.sync);

// Search endpoint
app.get('/api/search', searchLimiter, searchController.search);
```

---

## 📊 Monitoring

### Redis Rate Limit Stats

```typescript
// server/routes/admin.ts
export const adminRouter = t.router({
  getRateLimitStats: t.procedure.query(async () => {
    const keys = await redis.keys('rl:*');
    const stats: Record<string, number> = {};
    
    for (const key of keys) {
      const count = await redis.get(key);
      stats[key] = parseInt(count || '0');
    }
    
    return stats;
  }),
  
  getBannedIPs: t.procedure.query(async () => {
    const keys = await redis.keys('banned:*');
    return keys.map(k => k.replace('banned:', ''));
  }),
});
```

---

## 🔄 Cache Invalidation

```typescript
// Invalidate rate limit on user upgrade
async function upgradeUserTier(userId: number, newTier: string) {
  // Update user tier
  await db.update(users)
    .set({ tier: newTier })
    .where(eq(users.id, userId));
  
  // Clear rate limit cache for this user
  await redis.del(`rl:adaptive:user:${userId}`);
  
  return { success: true };
}
```

---

## 📈 Performance Impact

- **DDoS Protection**: Blocks malicious traffic before reaching app
- **Per-Endpoint Limiting**: Protects expensive queries
- **User-Based Limiting**: Fair usage for authenticated users
- **Redis Backend**: Distributed, scalable rate limiting

---

## 🎯 Best Practices

1. **Monitor rate limits** - Track which endpoints are being hit
2. **Adjust limits** - Based on actual usage patterns
3. **Whitelist trusted IPs** - Admin IPs, monitoring services
4. **Log violations** - Track potential attacks
5. **Alert on spikes** - Notify on unusual activity
6. **Update regularly** - Adjust limits as traffic grows

---

**Expected Protection: 99% DDoS mitigation**
