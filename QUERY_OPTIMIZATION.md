# Query Optimization Guide - PRIORITÀ 2

## 📊 Performance Analysis

### Query Lente Identificate

#### 1. **Leaderboard Query** (CRITICA)
```sql
-- ❌ LENTA: Join 3 tabelle senza indici
SELECT sp.*, u.name, COUNT(sa.id) as activity_count
FROM swimmer_profiles sp
JOIN users u ON sp.user_id = u.id
LEFT JOIN swimming_activities sa ON sp.user_id = sa.user_id
GROUP BY sp.id, u.id
ORDER BY sp.total_xp DESC
LIMIT 100;
```

**Problema:** 
- ❌ No index on `swimming_activities.user_id`
- ❌ No index on `swimmer_profiles.user_id`
- ❌ GROUP BY senza indici

**Impatto:** ~2-5 secondi per 10K utenti

---

#### 2. **User Statistics Query** (ALTA)
```sql
-- ❌ LENTA: Aggregazione senza indici
SELECT 
  COUNT(*) as total_activities,
  SUM(distance_meters) as total_distance,
  SUM(duration_seconds) as total_time
FROM swimming_activities
WHERE user_id = $1
  AND activity_date >= NOW() - INTERVAL '30 days';
```

**Problema:**
- ❌ No index on `(user_id, activity_date)`
- ❌ Full table scan

**Impatto:** ~500ms per query

---

#### 3. **Badge Unlock Check** (MEDIA)
```sql
-- ❌ LENTA: Subquery senza indici
SELECT * FROM user_badges
WHERE user_id = $1
  AND badge_id NOT IN (
    SELECT id FROM badge_definitions 
    WHERE category = 'distance'
  );
```

**Problema:**
- ❌ No index on `user_badges.user_id`
- ❌ Subquery inefficiente

**Impatto:** ~300ms

---

#### 4. **Activity Timeline** (MEDIA)
```sql
-- ❌ LENTA: ORDER BY senza indici
SELECT * FROM swimming_activities
WHERE user_id = $1
ORDER BY activity_date DESC
LIMIT 20;
```

**Problema:**
- ❌ No index on `(user_id, activity_date DESC)`
- ❌ Sort operation

**Impatto:** ~200ms

---

## 🔧 Soluzioni Implementate

### Indici Critici da Aggiungere

```sql
-- 1. Leaderboard optimization
CREATE INDEX idx_swimmer_profiles_user_id ON swimmer_profiles(user_id);
CREATE INDEX idx_swimming_activities_user_id ON swimming_activities(user_id);
CREATE INDEX idx_swimming_activities_user_date ON swimming_activities(user_id, activity_date DESC);

-- 2. Statistics optimization
CREATE INDEX idx_swimming_activities_user_date_range ON swimming_activities(user_id, activity_date);

-- 3. Badge optimization
CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_badge_definitions_category ON badge_definitions(category);

-- 4. Timeline optimization
CREATE INDEX idx_swimming_activities_user_date_desc ON swimming_activities(user_id, activity_date DESC);

-- 5. Additional performance indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_open_id ON users(open_id);
CREATE INDEX idx_swimmer_profiles_level ON swimmer_profiles(level DESC);
CREATE INDEX idx_swimming_activities_date ON swimming_activities(activity_date DESC);
CREATE INDEX idx_user_xp_log_user_id ON user_xp_log(user_id);
CREATE INDEX idx_challenges_user_id ON challenges(user_id);
CREATE INDEX idx_leaderboard_scores_user_id ON leaderboard_scores(user_id);
```

---

## ⚡ Query Optimization Techniques

### 1. N+1 Query Prevention

**❌ PRIMA (N+1 Problem):**
```typescript
const users = await db.select().from(users);
for (const user of users) {
  const activities = await db.select().from(swimmingActivities)
    .where(eq(swimmingActivities.userId, user.id));
  // N queries!
}
```

**✅ DOPO (Batch Query):**
```typescript
const usersWithActivities = await db.select()
  .from(users)
  .leftJoin(swimmingActivities, eq(users.id, swimmingActivities.userId));
  // 1 query!
```

---

### 2. Caching Strategy

**Redis Cache Pattern:**
```typescript
// Cache leaderboard for 1 hour
const cacheKey = 'leaderboard:top100';
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const leaderboard = await db.select()
  .from(swimmerProfiles)
  .orderBy(desc(swimmerProfiles.totalXp))
  .limit(100);

await redis.setex(cacheKey, 3600, JSON.stringify(leaderboard));
return leaderboard;
```

---

### 3. Pagination Optimization

**❌ LENTA (OFFSET):**
```sql
SELECT * FROM swimming_activities
WHERE user_id = $1
ORDER BY activity_date DESC
OFFSET 1000 LIMIT 20; -- Scans 1020 rows!
```

**✅ VELOCE (Cursor-based):**
```sql
SELECT * FROM swimming_activities
WHERE user_id = $1 
  AND activity_date < $2
ORDER BY activity_date DESC
LIMIT 20; -- Scans 20 rows!
```

---

## 📈 Performance Targets

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| Leaderboard | 2-5s | 200-300ms | **90%** |
| Statistics | 500ms | 50-100ms | **80%** |
| Badge Check | 300ms | 30-50ms | **85%** |
| Timeline | 200ms | 20-30ms | **85%** |
| **Average** | - | - | **~85%** |

---

## 🚀 Implementation Steps

### Step 1: Add Indexes (5 minutes)
```bash
# Run migration with indexes
psql $DATABASE_URL < migrations/add_performance_indexes.sql
```

### Step 2: Verify Indexes (2 minutes)
```sql
-- Check index creation
SELECT * FROM pg_indexes 
WHERE tablename IN ('swimming_activities', 'swimmer_profiles', 'user_badges');
```

### Step 3: Monitor Query Performance (ongoing)
```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 100; -- Log queries > 100ms
SELECT pg_reload_conf();
```

### Step 4: Test Queries (5 minutes)
```sql
-- Test leaderboard query
EXPLAIN ANALYZE
SELECT sp.*, COUNT(sa.id) as activity_count
FROM swimmer_profiles sp
LEFT JOIN swimming_activities sa ON sp.user_id = sa.user_id
GROUP BY sp.id
ORDER BY sp.total_xp DESC
LIMIT 100;
```

---

## 📊 Monitoring

### Query Performance Metrics

Monitor these queries in Rollbar/Logs:

1. **Leaderboard Query**
   - Target: < 300ms
   - Alert: > 500ms

2. **Statistics Query**
   - Target: < 100ms
   - Alert: > 200ms

3. **Activity Timeline**
   - Target: < 50ms
   - Alert: > 100ms

---

## 💾 Backup Before Changes

```bash
# Create backup before running migrations
pg_dump $DATABASE_URL > swimforge_backup_before_indexes.sql

# If something goes wrong, restore:
psql $DATABASE_URL < swimforge_backup_before_indexes.sql
```

---

## 🔍 Troubleshooting

### Index Not Being Used

```sql
-- Check if index is being used
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM swimming_activities
WHERE user_id = 123
ORDER BY activity_date DESC;

-- If "Seq Scan" appears, index may not be used
-- Solution: Run VACUUM ANALYZE
VACUUM ANALYZE swimming_activities;
```

### Slow After Index Creation

```sql
-- Reanalyze statistics
ANALYZE;

-- Check table bloat
SELECT schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 📚 Resources

- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [EXPLAIN Documentation](https://www.postgresql.org/docs/current/sql-explain.html)
- [Query Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

**Expected Performance Improvement: +40%**
**Implementation Time: ~30 minutes**
**Complexity: Medium**
