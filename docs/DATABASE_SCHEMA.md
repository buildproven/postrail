# LetterFlow Database Schema

Comprehensive documentation of the LetterFlow PostgreSQL database schema hosted on Supabase.

**Last Updated**: November 21, 2025
**Database**: PostgreSQL 15+ via Supabase
**Status**: Production-ready with pending optimizations

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Tables](#tables)
3. [Relationships](#relationships)
4. [Constraints & Indexes](#constraints--indexes)
5. [Row Level Security](#row-level-security)
6. [Common Query Patterns](#common-query-patterns)
7. [Performance Considerations](#performance-considerations)
8. [Migration History](#migration-history)
9. [Known Issues](#known-issues)

---

## Schema Overview

LetterFlow uses a PostgreSQL database with four primary tables:

```
┌─────────────────┐
│   auth.users    │ (Supabase managed)
└────────┬────────┘
         │
         │ user_id
         │
    ┌────▼──────────────┐
    │   newsletters     │
    └────┬──────────────┘
         │
         │ newsletter_id
         │
    ┌────▼──────────────┐      ┌─────────────────────┐
    │  social_posts     │◄─────┤ platform_connections│
    └────┬──────────────┘      └─────────────────────┘
         │                     user_id (foreign key)
         │ social_post_id
         │
    ┌────▼──────────────┐
    │  post_analytics   │
    └───────────────────┘
```

**Data Flow**:

1. User imports newsletter content → `newsletters` table
2. AI generates 6 posts (3 platforms × 2 types) → `social_posts` table
3. User connects social accounts → `platform_connections` table
4. Posts are published to platforms → `social_posts.status` updated
5. Analytics synced from platforms → `post_analytics` table (future)

---

## Tables

### 1. newsletters

Stores newsletter content imported by users for social media promotion.

```sql
CREATE TABLE public.newsletters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  title varchar(500),
  content text NOT NULL,
  source_url varchar(2000),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  scheduled_send_time timestamp with time zone,
  status text CHECK (status IN ('draft', 'scheduled', 'sent')) DEFAULT 'draft'
);
```

**Columns**:

| Column                | Type          | Nullable | Default           | Description                             |
| --------------------- | ------------- | -------- | ----------------- | --------------------------------------- |
| `id`                  | uuid          | NO       | gen_random_uuid() | Primary key                             |
| `user_id`             | uuid          | NO       | -                 | Foreign key to auth.users               |
| `title`               | varchar(500)  | YES      | NULL              | Newsletter title (extracted or manual)  |
| `content`             | text          | NO       | -                 | Full newsletter content                 |
| `source_url`          | varchar(2000) | YES      | NULL              | Original URL if scraped                 |
| `created_at`          | timestamptz   | NO       | now()             | Record creation timestamp               |
| `scheduled_send_time` | timestamptz   | YES      | NULL              | When newsletter was/will be sent        |
| `status`              | text          | NO       | 'draft'           | Workflow status: draft, scheduled, sent |

**Status Values**:

- `draft` - Newsletter imported, not yet processed
- `scheduled` - Newsletter scheduled for future sending
- `sent` - Newsletter has been sent to subscribers

**Missing Columns** (identified in audit):

- `updated_at` - Should track last modification time

**Indexes** (recommended, not yet applied):

- `newsletters(user_id, created_at DESC)` - Used in dashboard listing (18+ queries)
- `newsletters(id, user_id)` - Used in RLS policy evaluation

---

### 2. social_posts

Stores AI-generated social media posts for each newsletter and platform.

```sql
CREATE TABLE public.social_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id uuid REFERENCES public.newsletters ON DELETE CASCADE NOT NULL,
  platform text CHECK (platform IN ('linkedin', 'threads', 'facebook', 'twitter')) NOT NULL,
  post_type text CHECK (post_type IN ('pre_cta', 'post_cta')) NOT NULL,
  content text NOT NULL,
  character_count integer,
  scheduled_time timestamp with time zone,
  published_at timestamp with time zone,
  status text CHECK (status IN ('draft', 'scheduled', 'published', 'failed')) DEFAULT 'draft',
  error_message text,
  platform_post_id varchar(255),
  CONSTRAINT social_posts_newsletter_platform_type_unique
    UNIQUE (newsletter_id, platform, post_type)
);
```

**Columns**:

| Column             | Type         | Nullable | Default           | Description                                           |
| ------------------ | ------------ | -------- | ----------------- | ----------------------------------------------------- |
| `id`               | uuid         | NO       | gen_random_uuid() | Primary key                                           |
| `newsletter_id`    | uuid         | NO       | -                 | Foreign key to newsletters                            |
| `platform`         | text         | NO       | -                 | Target platform: linkedin, threads, facebook, twitter |
| `post_type`        | text         | NO       | -                 | Timing: pre_cta (before send), post_cta (after send)  |
| `content`          | text         | NO       | -                 | AI-generated post text                                |
| `character_count`  | integer      | YES      | NULL              | Length of content (for validation)                    |
| `scheduled_time`   | timestamptz  | YES      | NULL              | When to publish (nullable for drafts)                 |
| `published_at`     | timestamptz  | YES      | NULL              | Actual publication timestamp                          |
| `status`           | text         | NO       | 'draft'           | Lifecycle status                                      |
| `error_message`    | text         | YES      | NULL              | Error details if publishing failed                    |
| `platform_post_id` | varchar(255) | YES      | NULL              | Platform's post ID after publishing                   |

**Status Values**:

- `draft` - Post generated, not scheduled
- `scheduled` - Queued for future publishing
- `publishing` - **CRITICAL**: Used in code but not in database constraint (needs migration)
- `published` - Successfully posted to platform
- `failed` - Publishing failed (see error_message)

**Platform Character Limits**:

- LinkedIn: 3,000 characters (target 70% = 2,100)
- Threads: 500 characters (target 70% = 350)
- Facebook: 63,206 characters (target 70% = 44,244)
- Twitter: 280 characters (target 70% = 196)

**Post Types**:

- `pre_cta` - Teaser posted 24-8 hours BEFORE newsletter send
  - Creates FOMO, urgency, curiosity
  - Teases key insights without revealing everything
  - CTA: "Sign up so you don't miss it"

- `post_cta` - Engagement posted 48-72 hours AFTER newsletter send
  - Reframes as valuable resource (guide/playbook/blueprint)
  - Lists specific outcomes/benefits
  - CTA: "Comment [WORD] to get access"

**Missing Columns** (identified in audit):

- `updated_at` - Required for optimistic locking (code expects this but column doesn't exist)

**Unique Constraint**:

```sql
CONSTRAINT social_posts_newsletter_platform_type_unique
  UNIQUE (newsletter_id, platform, post_type)
```

- Prevents duplicate post generation for same newsletter/platform/type combination
- Idempotency protection: retrying failed generation returns existing posts
- Applied via migration: `docs/DATABASE_MIGRATION_unique_constraint.sql`

---

### 3. platform_connections

Stores encrypted OAuth credentials for connected social media accounts.

```sql
CREATE TABLE public.platform_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  platform text CHECK (platform IN ('linkedin', 'threads', 'facebook', 'twitter')) NOT NULL,
  oauth_token text NOT NULL,
  oauth_refresh_token text,
  token_expires_at timestamp with time zone,
  connected_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_active boolean DEFAULT true,
  platform_user_id varchar(255),
  platform_username varchar(255),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(user_id, platform)
);
```

**Columns**:

| Column                | Type         | Nullable | Default           | Description                                    |
| --------------------- | ------------ | -------- | ----------------- | ---------------------------------------------- |
| `id`                  | uuid         | NO       | gen_random_uuid() | Primary key                                    |
| `user_id`             | uuid         | NO       | -                 | Foreign key to auth.users                      |
| `platform`            | text         | NO       | -                 | Platform: linkedin, threads, facebook, twitter |
| `oauth_token`         | text         | NO       | -                 | Encrypted access token or hash (for BYOK)      |
| `oauth_refresh_token` | text         | YES      | NULL              | Encrypted refresh token (OAuth flow)           |
| `token_expires_at`    | timestamptz  | YES      | NULL              | Token expiration timestamp                     |
| `connected_at`        | timestamptz  | NO       | now()             | When connection was established                |
| `is_active`           | boolean      | NO       | true              | Whether connection is valid                    |
| `platform_user_id`    | varchar(255) | YES      | NULL              | Platform's user ID                             |
| `platform_username`   | varchar(255) | YES      | NULL              | Platform's username/handle                     |
| `metadata`            | jsonb        | NO       | {}                | Platform-specific configuration                |

**Platform-Specific Behavior**:

**Twitter (BYOK - Bring Your Own Keys)**:

- `oauth_token` stores SHA-256 hash of API key (for quick validation)
- `oauth_refresh_token` not used (Twitter v2 uses long-lived tokens)
- `metadata` stores encrypted credentials:
  ```json
  {
    "apiKey": "encrypted_value",
    "apiSecret": "encrypted_value",
    "accessToken": "encrypted_value",
    "accessTokenSecret": "encrypted_value"
  }
  ```

**LinkedIn/Facebook/Threads (OAuth)**:

- `oauth_token` stores encrypted access token
- `oauth_refresh_token` stores encrypted refresh token
- `metadata` stores platform-specific config (future use)

**Encryption**:

- All credentials encrypted with AES-256-GCM
- Encryption key from `ENCRYPTION_KEY` environment variable
- Decryption occurs at runtime via `lib/crypto.ts`

**Missing Columns** (identified in audit):

- `updated_at` - Should track credential updates

**Indexes** (recommended, not yet applied):

- `platform_connections(user_id, platform)` - Used in credential lookup (frequent)

---

### 4. post_analytics

Stores engagement metrics synced from social media platforms (future feature).

```sql
CREATE TABLE public.post_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  social_post_id uuid REFERENCES public.social_posts ON DELETE CASCADE NOT NULL,
  impressions integer DEFAULT 0,
  engagements integer DEFAULT 0,
  clicks integer DEFAULT 0,
  shares integer DEFAULT 0,
  comments integer DEFAULT 0,
  last_synced_at timestamp with time zone
);
```

**Columns**:

| Column           | Type        | Nullable | Default           | Description                                  |
| ---------------- | ----------- | -------- | ----------------- | -------------------------------------------- |
| `id`             | uuid        | NO       | gen_random_uuid() | Primary key                                  |
| `social_post_id` | uuid        | NO       | -                 | Foreign key to social_posts                  |
| `impressions`    | integer     | NO       | 0                 | Number of times post was displayed           |
| `engagements`    | integer     | NO       | 0                 | Total interactions (likes, comments, shares) |
| `clicks`         | integer     | NO       | 0                 | Link clicks                                  |
| `shares`         | integer     | NO       | 0                 | Post shares/retweets                         |
| `comments`       | integer     | NO       | 0                 | Number of comments                           |
| `last_synced_at` | timestamptz | YES      | NULL              | Last sync from platform APIs                 |

**Status**:

- Table created but unused
- Future feature for analytics dashboard
- Ready for implementation in Week 6 roadmap

---

## Relationships

### Entity Relationship Diagram

```
auth.users (1) ─────────────── (*) newsletters
                                      │
                                      │ (1)
                                      │
                                      ▼ (*)
                                 social_posts
                                      │
                                      │ (1)
                                      │
                                      ▼ (*)
                                post_analytics

auth.users (1) ─────────────── (*) platform_connections
```

### Foreign Key Constraints

| Child Table          | Column         | Parent Table | Parent Column | On Delete                  |
| -------------------- | -------------- | ------------ | ------------- | -------------------------- |
| newsletters          | user_id        | auth.users   | id            | CASCADE (Supabase managed) |
| social_posts         | newsletter_id  | newsletters  | id            | CASCADE                    |
| platform_connections | user_id        | auth.users   | id            | CASCADE                    |
| post_analytics       | social_post_id | social_posts | id            | CASCADE                    |

**Cascade Behavior**:

- Deleting a user deletes all their newsletters, platform connections, and associated posts
- Deleting a newsletter deletes all its social posts and analytics
- Deleting a social post deletes its analytics

---

## Constraints & Indexes

### Primary Keys

All tables use UUID v4 primary keys generated via `gen_random_uuid()`:

- Globally unique across distributed systems
- No sequential information leakage
- Compatible with replication and sharding

### Check Constraints

**newsletters.status**:

```sql
CHECK (status IN ('draft', 'scheduled', 'sent'))
```

**social_posts.platform**:

```sql
CHECK (platform IN ('linkedin', 'threads', 'facebook', 'twitter'))
```

**social_posts.post_type**:

```sql
CHECK (post_type IN ('pre_cta', 'post_cta'))
```

**social_posts.status**:

```sql
-- CURRENT (incorrect):
CHECK (status IN ('draft', 'scheduled', 'published', 'failed'))

-- REQUIRED (missing 'publishing'):
CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed'))
```

**Action Required**: Apply migration to add 'publishing' status value.

**platform_connections.platform**:

```sql
CHECK (platform IN ('linkedin', 'threads', 'facebook', 'twitter'))
```

### Unique Constraints

**social_posts**:

```sql
CONSTRAINT social_posts_newsletter_platform_type_unique
  UNIQUE (newsletter_id, platform, post_type)
```

- Prevents duplicate post generation
- Idempotency protection for AI generation endpoint
- Applied via `docs/DATABASE_MIGRATION_unique_constraint.sql`

**platform_connections**:

```sql
UNIQUE(user_id, platform)
```

- One connection per platform per user
- Prevents duplicate OAuth connections

### Indexes

**Current State**: No indexes applied beyond automatic primary key indexes.

**Critical Missing Indexes** (95% performance degradation on large datasets):

```sql
-- Newsletter listing (dashboard page)
CREATE INDEX idx_newsletters_user_created
  ON newsletters(user_id, created_at DESC);

-- Newsletter post retrieval (preview page)
CREATE INDEX idx_social_posts_newsletter
  ON social_posts(newsletter_id, platform, post_type);

-- RLS policy optimization
CREATE INDEX idx_newsletters_id_user
  ON newsletters(id, user_id);

-- Platform credential lookup (Twitter posting)
CREATE INDEX idx_platform_connections_user_platform
  ON platform_connections(user_id, platform);
```

**Performance Impact**:

- Without indexes: O(n) full table scan
- With indexes: O(log n) index seek
- Estimated improvement: 95% faster queries on datasets >1000 rows

---

## Row Level Security

All tables have Row Level Security (RLS) enabled to enforce data access control at the database level.

### newsletters Policies

```sql
-- SELECT: Users can view their own newsletters
CREATE POLICY "Users can view their own newsletters"
  ON public.newsletters FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Users can create newsletters
CREATE POLICY "Users can insert their own newsletters"
  ON public.newsletters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can modify their newsletters
CREATE POLICY "Users can update their own newsletters"
  ON public.newsletters FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: Users can delete their newsletters
CREATE POLICY "Users can delete their own newsletters"
  ON public.newsletters FOR DELETE
  USING (auth.uid() = user_id);
```

### social_posts Policies

```sql
-- SELECT: Users can view posts from their newsletters
CREATE POLICY "Users can view posts from their newsletters"
  ON public.social_posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletters
      WHERE newsletters.id = social_posts.newsletter_id
        AND newsletters.user_id = auth.uid()
    )
  );

-- INSERT: Users can create posts for their newsletters
CREATE POLICY "Users can insert posts for their newsletters"
  ON public.social_posts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.newsletters
      WHERE newsletters.id = social_posts.newsletter_id
        AND newsletters.user_id = auth.uid()
    )
  );

-- UPDATE: Users can update posts from their newsletters
CREATE POLICY "Users can update posts from their newsletters"
  ON public.social_posts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletters
      WHERE newsletters.id = social_posts.newsletter_id
        AND newsletters.user_id = auth.uid()
    )
  );

-- DELETE: Users can delete posts from their newsletters
CREATE POLICY "Users can delete posts from their newsletters"
  ON public.social_posts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletters
      WHERE newsletters.id = social_posts.newsletter_id
        AND newsletters.user_id = auth.uid()
    )
  );
```

**Note**: These policies join through `newsletters` table, creating hierarchical ownership:

- User owns newsletter → User owns newsletter's posts

### platform_connections Policies

```sql
-- Users can only access their own platform connections
CREATE POLICY "Users can view their own platform connections"
  ON public.platform_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own platform connections"
  ON public.platform_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own platform connections"
  ON public.platform_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own platform connections"
  ON public.platform_connections FOR DELETE
  USING (auth.uid() = user_id);
```

**Security Benefits**:

- Prevents cross-user data access
- Prevents credential theft
- Database-level enforcement (can't bypass in application code)

### post_analytics Policies

```sql
-- Users can access analytics for their posts
CREATE POLICY "Users can view analytics for their posts"
  ON public.post_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.social_posts
      JOIN public.newsletters ON newsletters.id = social_posts.newsletter_id
      WHERE social_posts.id = post_analytics.social_post_id
        AND newsletters.user_id = auth.uid()
    )
  );

-- Similar policies for INSERT/UPDATE with nested ownership checks
```

**Note**: Three-level ownership chain:

- User owns newsletter → Newsletter owns post → Post owns analytics

---

## Common Query Patterns

### 1. Dashboard Newsletter Listing

```typescript
// app/dashboard/newsletters/page.tsx:18
const { data: newsletters } = await supabase
  .from('newsletters')
  .select('*')
  .order('created_at', { ascending: false })

// Current: O(n) full table scan
// With index on (user_id, created_at): O(log n) + RLS filter
```

**Query Plan**:

- RLS automatically adds `WHERE user_id = auth.uid()`
- `ORDER BY created_at DESC` requires index for efficiency
- Missing index causes full table scan

### 2. Newsletter Preview with Posts

```typescript
// app/dashboard/newsletters/[id]/preview/page.tsx:45
const { data: newsletter } = await supabase
  .from('newsletters')
  .select(
    `
    *,
    social_posts (
      id,
      platform,
      post_type,
      content,
      character_count,
      status
    )
  `
  )
  .eq('id', params.id)
  .single()

// Two queries executed:
// 1. SELECT * FROM newsletters WHERE id = ? AND user_id = auth.uid()
// 2. SELECT * FROM social_posts WHERE newsletter_id = ?
```

**Optimization**:

- First query fast (primary key lookup)
- Second query needs index on `newsletter_id`

### 3. AI Post Generation (Idempotent)

```typescript
// app/api/generate-posts/route.ts:301-422
// Step 1: Check for existing posts
const { data: existingPosts } = await supabase
  .from('social_posts')
  .select('*')
  .eq('newsletter_id', newsletterId)

if (existingPosts.length === 6) {
  return existingPosts // Already generated
}

// Step 2: Create newsletter
const { data: newsletter } = await supabase
  .from('newsletters')
  .insert({ user_id, title, content })
  .select()
  .single()

// Step 3: Generate and insert posts (batch)
const posts = await Promise.all([
  // 6 parallel AI generation calls
])

const { data: savedPosts } = await supabase
  .from('social_posts')
  .insert(posts)
  .select()
```

**Idempotency Protection**:

- Unique constraint on `(newsletter_id, platform, post_type)` prevents duplicates
- Returns existing posts on retry without regenerating
- Transaction-safe: rollback newsletter creation if posts fail

### 4. Twitter Posting (Optimistic Locking)

```typescript
// app/api/platforms/twitter/post/route.ts:106-222
// Step 1: Atomic fetch-and-lock
const { data: postWithNewsletter } = await supabase
  .from('social_posts')
  .select(
    `
    *,
    newsletter:newsletters!inner(user_id),
    updated_at
  `
  )
  .eq('id', socialPostId)
  .single()

// Step 2: Idempotency check
if (
  postWithNewsletter.status === 'published' &&
  postWithNewsletter.platform_post_id
) {
  return { success: true, fromCache: true }
}

// Step 3: Optimistic lock update
const { data: updated } = await supabase
  .from('social_posts')
  .update({
    status: 'publishing',
    error_message: null,
  })
  .eq('id', socialPostId)
  .eq('updated_at', postWithNewsletter.updated_at) // Optimistic lock
  .select()
  .single()

// Step 4: Publish to Twitter
const result = await twitterClient.v2.tweet(content)

// Step 5: Mark as published
await supabase
  .from('social_posts')
  .update({
    status: 'published',
    published_at: new Date().toISOString(),
    platform_post_id: result.data.id,
  })
  .eq('id', socialPostId)
```

**Concurrency Protection**:

- Status check prevents duplicate publishing
- Optimistic locking via `updated_at` timestamp
- **CRITICAL BUG**: `updated_at` column doesn't exist, lock silently fails
- Needs migration to add `updated_at` + trigger

### 5. Platform Credentials Lookup

```typescript
// app/api/platforms/twitter/post/route.ts:29
const { data: connection } = await supabase
  .from('platform_connections')
  .select('metadata, is_active')
  .eq('user_id', userId)
  .eq('platform', 'twitter')
  .single()

// Current: O(n) table scan with two WHERE conditions
// With index on (user_id, platform): O(1) hash lookup
```

**Security Flow**:

1. Retrieve encrypted credentials from `metadata` JSONB field
2. Decrypt using `lib/crypto.ts` with `ENCRYPTION_KEY`
3. Create platform API client with credentials
4. Publish post to platform

---

## Performance Considerations

### Query Performance

**Current State** (no indexes):

- Newsletter listing: O(n) full table scan
- Post retrieval: O(n) full table scan per newsletter
- Credential lookup: O(n) with multiple conditions
- RLS policy evaluation: O(n) join operations

**With Recommended Indexes**:

- Newsletter listing: O(log n) index seek + filter
- Post retrieval: O(log n) index seek
- Credential lookup: O(1) hash lookup
- RLS policy evaluation: O(log n) with indexed joins

**Benchmark Estimates** (10,000 newsletters, 60,000 posts):

- Dashboard page load: 2500ms → 50ms (50x faster)
- Preview page load: 1500ms → 30ms (50x faster)
- Twitter posting: 800ms → 15ms (53x faster)

### Database Size Projections

**Storage per User** (1 year):

- 52 newsletters × 500 bytes = 26 KB
- 312 social posts × 800 bytes = 250 KB
- 4 platform connections × 1 KB = 4 KB
- **Total**: ~280 KB per user per year

**Scale Targets**:

- 1,000 users: 280 MB
- 10,000 users: 2.8 GB
- 100,000 users: 28 GB

Supabase free tier: 500 MB database (supports ~1,800 active users for 1 year)

### Optimization Recommendations

**Immediate** (before next deployment):

1. Add critical indexes (4 indexes, 2-hour migration)
2. Add `updated_at` columns with triggers (1-hour migration)
3. Fix `status` enum to include 'publishing' (30-min migration)
4. Apply unique constraint migration (already created, pending)

**Near-term** (this sprint):

1. Implement proper database transactions for AI generation
2. Add connection pooling configuration
3. Optimize RLS policies with materialized views (if needed)
4. Add query monitoring and slow query logging

**Long-term** (next quarter):

1. Implement database replication for read scaling
2. Add caching layer (Redis) for frequently accessed data
3. Implement data archival strategy for old newsletters
4. Add database backup and point-in-time recovery

---

## Migration History

### Applied Migrations ✅

**1. Twitter Platform Support** (`docs/DATABASE_MIGRATION_twitter.sql`)

- Date: November 2025
- Added 'twitter' to platform enum constraints
- Added `metadata` JSONB column for BYOK credentials
- Status: ✅ Applied

**2. Nullable Scheduled Time** (`docs/DATABASE_MIGRATION_scheduled_time.sql`)

- Date: November 16, 2025
- Made `social_posts.scheduled_time` nullable for draft posts
- Allows post generation without scheduling
- Status: ✅ Applied

### Pending Migrations ⏳

**3. Unique Constraint** (`docs/DATABASE_MIGRATION_unique_constraint.sql`)

- Status: ⏳ Created but not applied
- Impact: **HIGH** - Prevents duplicate post generation
- Risk: LOW (non-destructive, checks for duplicates first)
- Action: Apply in Supabase SQL Editor immediately

**4. Add updated_at Columns** (not yet created)

- Status: ⏳ Needs creation
- Tables: newsletters, social_posts, platform_connections
- Impact: **CRITICAL** - Required for optimistic locking
- Risk: LOW (non-destructive, backwards compatible)

```sql
-- Migration to add updated_at columns
ALTER TABLE public.newsletters
  ADD COLUMN updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.social_posts
  ADD COLUMN updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.platform_connections
  ADD COLUMN updated_at timestamp with time zone DEFAULT now();

-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_newsletters_updated_at
  BEFORE UPDATE ON public.newsletters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_connections_updated_at
  BEFORE UPDATE ON public.platform_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**5. Fix Status Enum** (not yet created)

- Status: ⏳ Needs creation
- Impact: **CRITICAL** - Code uses 'publishing' status, database rejects it
- Risk: LOW (additive change only)

```sql
-- Migration to fix status enum
ALTER TABLE public.social_posts
  DROP CONSTRAINT social_posts_status_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed'));
```

**6. Performance Indexes** (not yet created)

- Status: ⏳ Needs creation
- Impact: **HIGH** - 95% performance improvement
- Risk: LOW (non-destructive, may take time on large datasets)

```sql
-- Migration to add performance indexes
CREATE INDEX CONCURRENTLY idx_newsletters_user_created
  ON newsletters(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_social_posts_newsletter
  ON social_posts(newsletter_id, platform, post_type);

CREATE INDEX CONCURRENTLY idx_newsletters_id_user
  ON newsletters(id, user_id);

CREATE INDEX CONCURRENTLY idx_platform_connections_user_platform
  ON platform_connections(user_id, platform);
```

**Note**: `CONCURRENTLY` allows index creation without locking table for writes.

### Migration Execution Order

```bash
# 1. CRITICAL: Fix schema bugs (apply first)
docs/DATABASE_MIGRATION_unique_constraint.sql  # Idempotency protection
docs/NEW_updated_at_columns.sql                # Optimistic locking
docs/NEW_fix_status_enum.sql                   # Status constraint fix

# 2. PERFORMANCE: Add indexes (apply after schema fixes)
docs/NEW_performance_indexes.sql               # Query optimization

# 3. Verify all migrations
SELECT * FROM information_schema.columns
WHERE table_name IN ('newsletters', 'social_posts', 'platform_connections')
ORDER BY table_name, ordinal_position;
```

---

## Known Issues

### Critical Issues 🔴

**1. Missing updated_at Column**

- **File**: `app/api/platforms/twitter/post/route.ts:102`
- **Issue**: Code queries non-existent `updated_at` column for optimistic locking
- **Impact**: Concurrent POST requests can both publish duplicate posts
- **Fix**: Apply migration to add `updated_at` column + trigger

**2. Status Enum Mismatch**

- **File**: `app/api/platforms/twitter/post/route.ts:175`
- **Issue**: Code uses 'publishing' status, database constraint rejects it
- **Impact**: Twitter posting fails with constraint violation
- **Fix**: Apply migration to update status enum

**3. Unique Constraint Not Applied**

- **File**: `docs/DATABASE_MIGRATION_unique_constraint.sql`
- **Issue**: Migration exists but not applied to database
- **Impact**: Duplicate posts can be generated for same newsletter
- **Fix**: Run migration in Supabase SQL Editor

### High-Priority Issues 🟡

**4. Missing Performance Indexes**

- **Impact**: 95% performance degradation on large datasets
- **Queries Affected**: Dashboard listing, preview page, credential lookup
- **Fix**: Apply performance index migration

**5. Non-Transactional AI Generation**

- **File**: `app/api/generate-posts/route.ts:338-400`
- **Issue**: Newsletter created before posts validated, partial failures leave orphans
- **Current Mitigation**: Best-effort deletion on failure (line 400)
- **Better Solution**: Use database transaction (RPC function)

**6. Incomplete TypeScript Types**

- **Files**: `components/post-preview-card.tsx:14`, `app/dashboard/platforms/page.tsx:16`
- **Issue**: Database types defined inline, inconsistent across files
- **Impact**: Type-unsafe queries, runtime errors possible
- **Fix**: Generate types from database schema

### Data Integrity Risks ⚠️

| Scenario                         | Likelihood | Severity | Current Mitigation |
| -------------------------------- | ---------- | -------- | ------------------ |
| Concurrent tweets duplicate post | MEDIUM     | HIGH     | None (lock broken) |
| Newsletter created, posts fail   | LOW        | MEDIUM   | Best-effort delete |
| ENCRYPTION_KEY rotated           | LOW        | CRITICAL | None               |
| Database constraint violations   | MEDIUM     | MEDIUM   | Returns existing   |
| RLS policy blocks valid query    | LOW        | HIGH     | App-level checks   |

**Overall Risk Level**: MEDIUM (acceptable for development, needs fixes for production)

---

## TypeScript Type Definitions

**Current State**: Types defined inline in components (inconsistent).

**Recommended**: Generate types from database schema using Supabase CLI.

```typescript
// Recommended: lib/database.types.ts (generated from schema)

export interface Database {
  public: {
    Tables: {
      newsletters: {
        Row: {
          id: string
          user_id: string
          title: string | null
          content: string
          source_url: string | null
          created_at: string
          updated_at: string // Add after migration
          scheduled_send_time: string | null
          status: 'draft' | 'scheduled' | 'sent'
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          content: string
          source_url?: string | null
          created_at?: string
          updated_at?: string
          scheduled_send_time?: string | null
          status?: 'draft' | 'scheduled' | 'sent'
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          content?: string
          source_url?: string | null
          created_at?: string
          updated_at?: string
          scheduled_send_time?: string | null
          status?: 'draft' | 'scheduled' | 'sent'
        }
      }
      social_posts: {
        Row: {
          id: string
          newsletter_id: string
          platform: 'linkedin' | 'threads' | 'facebook' | 'twitter'
          post_type: 'pre_cta' | 'post_cta'
          content: string
          character_count: number | null
          scheduled_time: string | null
          published_at: string | null
          status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
          error_message: string | null
          platform_post_id: string | null
          created_at: string
          updated_at: string // Add after migration
        }
        // Insert/Update types...
      }
      platform_connections: {
        Row: {
          id: string
          user_id: string
          platform: 'linkedin' | 'threads' | 'facebook' | 'twitter'
          oauth_token: string
          oauth_refresh_token: string | null
          token_expires_at: string | null
          connected_at: string
          updated_at: string // Add after migration
          is_active: boolean
          platform_user_id: string | null
          platform_username: string | null
          metadata: Record<string, unknown>
        }
        // Insert/Update types...
      }
      post_analytics: {
        Row: {
          id: string
          social_post_id: string
          impressions: number
          engagements: number
          clicks: number
          shares: number
          comments: number
          last_synced_at: string | null
        }
        // Insert/Update types...
      }
    }
  }
}
```

**Generate Types**:

```bash
# Install Supabase CLI
npm install -g supabase

# Generate types from live database
npx supabase gen types typescript --project-id [your-project-id] > lib/database.types.ts

# Or from local schema
npx supabase gen types typescript --local > lib/database.types.ts
```

**Usage**:

```typescript
import { Database } from '@/lib/database.types'

type Newsletter = Database['public']['Tables']['newsletters']['Row']
type SocialPost = Database['public']['Tables']['social_posts']['Row']

const supabase = createClient<Database>()
```

---

## Deployment Checklist

Before deploying to production:

### ✅ Critical Migrations

- [ ] Apply unique constraint migration
- [ ] Add `updated_at` columns + triggers
- [ ] Fix `status` enum to include 'publishing'
- [ ] Add performance indexes

### ✅ Schema Validation

```sql
-- Verify columns exist
SELECT * FROM information_schema.columns
WHERE table_name IN ('newsletters', 'social_posts', 'platform_connections')
ORDER BY table_name, ordinal_position;

-- Verify constraints
SELECT constraint_name, constraint_type, table_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verify indexes
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename;
```

### ✅ Functional Testing

- [ ] Test optimistic locking: simulate concurrent POST requests, verify only one succeeds
- [ ] Test idempotency: retry same AI generation request, should return cached result
- [ ] Test RLS policies: verify users can't access other users' data
- [ ] Load test with production indexes: measure query performance

### ✅ Security Validation

- [ ] Verify `ENCRYPTION_KEY` is set and valid (64 hex chars)
- [ ] Verify all OAuth tokens are encrypted
- [ ] Test RLS policies prevent cross-user access
- [ ] Verify no hardcoded secrets in database

### ✅ Backup & Recovery

- [ ] Enable automated backups in Supabase
- [ ] Test point-in-time recovery
- [ ] Document rollback procedures
- [ ] Verify backup retention policy

---

## Additional Resources

**Related Documentation**:

- `/Users/brettstark/Projects/letterflow/docs/SETUP_SUPABASE.md` - Initial database setup
- `/Users/brettstark/Projects/letterflow/docs/ARCHITECTURE.md` - System architecture overview
- `/Users/brettstark/Projects/letterflow/docs/DATABASE_ANALYSIS_2025-11-21.md` - Detailed audit findings
- `/Users/brettstark/Projects/letterflow/CLAUDE.md` - Development patterns and conventions

**Migration Files**:

- `/Users/brettstark/Projects/letterflow/docs/DATABASE_MIGRATION_twitter.sql` ✅ Applied
- `/Users/brettstark/Projects/letterflow/docs/DATABASE_MIGRATION_scheduled_time.sql` ✅ Applied
- `/Users/brettstark/Projects/letterflow/docs/DATABASE_MIGRATION_unique_constraint.sql` ⏳ Pending

**Code References**:

- Database queries: `/Users/brettstark/Projects/letterflow/app/api/**/route.ts`
- Supabase clients: `/Users/brettstark/Projects/letterflow/lib/supabase/`
- Type definitions: `/Users/brettstark/Projects/letterflow/components/*.tsx`

**Supabase Dashboard**:

- Project: https://supabase.com/dashboard
- SQL Editor: Database → SQL Editor
- Table Editor: Database → Table Editor
- Logs: Logs & Reports

---

**Document Status**: Complete
**Maintainer**: Development Team
**Review Cycle**: After each migration or schema change
