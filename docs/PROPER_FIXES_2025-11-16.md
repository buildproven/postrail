# Proper Fixes Applied - November 16, 2025

## Summary

Replaced hacky workarounds with proper engineering solutions for database schema and content extraction.

---

## Fix 1: Database Schema - Make scheduled_time Nullable ✅

### Problem

Database required `scheduled_time NOT NULL` but draft posts don't have a scheduled time yet. The workaround was using a far-future sentinel value (`2099-12-31`).

### Root Cause

Schema design mismatch with business logic:

- Drafts don't have scheduled times (status='draft')
- Only scheduled/published posts have real scheduled times

### Proper Solution

Made `scheduled_time` nullable in the database schema.

**Migration SQL** (run in Supabase SQL Editor):

```sql
ALTER TABLE public.social_posts
ALTER COLUMN scheduled_time DROP NOT NULL;
```

**Code change**:

```typescript
// Before (hack):
scheduled_time: new Date('2099-12-31T23:59:59Z').toISOString()

// After (proper):
scheduled_time: null
```

**Files changed**:

- `docs/DATABASE_MIGRATION_scheduled_time.sql` - Migration script
- `docs/SETUP_SUPABASE.md` - Updated schema documentation
- `app/api/generate-posts/route.ts` - Removed placeholder date, use null

### To Apply

1. Open Supabase dashboard → SQL Editor
2. Run the migration SQL from `docs/DATABASE_MIGRATION_scheduled_time.sql`
3. Verify with: `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'social_posts' AND column_name = 'scheduled_time';`
4. Should show `is_nullable = YES`

---

## Fix 2: Content Scraping - Mozilla Readability ✅

### Problem

Custom cheerio scraping with platform-specific selectors was fragile:

- "HomePosts" navigation leaked into content
- Broad selectors like `[class*="nav"]` could remove legitimate content
- Whack-a-mole approach for each new edge case
- Didn't work well for unknown platforms

### Root Cause

Trying to manually filter DOM elements instead of using intelligent article extraction.

### Proper Solution

Integrated **Mozilla Readability** - the same library Firefox Reader Mode uses for article extraction.

**Dependencies added**:

```bash
npm install @mozilla/readability jsdom
```

**Implementation**:

```typescript
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

// Parse HTML and extract article content intelligently
const dom = new JSDOM(html, { url })
const reader = new Readability(dom.window.document)
const article = reader.parse()

const title = article.title || ''
const content = article.textContent || ''
```

**Benefits**:

- ✅ Automatically identifies article content vs UI chrome
- ✅ Works across any platform (beehiiv, substack, custom sites)
- ✅ Removes navigation, ads, sidebars automatically
- ✅ Battle-tested (used by millions in Firefox)
- ✅ No platform-specific hacks needed

**Files changed**:

- `app/api/scrape/route.ts` - Replaced cheerio logic with Readability
- `package.json` - Added @mozilla/readability and jsdom dependencies

### How It Works

Readability uses heuristics to:

1. Find the main article element
2. Score elements by content density
3. Remove low-quality content (ads, navigation, comments)
4. Extract clean title and text
5. Preserve paragraph structure

---

## Comparison: Before vs After

| Issue                | Hack (Before)                | Proper Fix (After)                        |
| -------------------- | ---------------------------- | ----------------------------------------- |
| **scheduled_time**   | `2099-12-31` sentinel value  | Database schema made nullable             |
| **Content scraping** | Platform-specific selectors  | Mozilla Readability (Firefox Reader Mode) |
| **Maintainability**  | Add selectors for each issue | Library handles edge cases                |
| **Reliability**      | Fragile, breaks on changes   | Battle-tested, robust                     |

---

## Testing Checklist

### Database Fix

- [ ] Run migration SQL in Supabase
- [ ] Verify column is nullable: `is_nullable = YES`
- [ ] Create newsletter and check `social_posts.scheduled_time` is NULL
- [ ] No database constraint errors on post generation

### Content Scraping

- [x] Scrapes aisecondact.com without "HomePosts" leak
- [ ] Preserves paragraph structure (newlines visible)
- [ ] Works on beehiiv.com URLs
- [ ] Works on substack.com URLs
- [ ] Works on unknown platforms
- [ ] Rejects pages without article content

---

## Next Steps

1. **Apply database migration** - Run the SQL in Supabase dashboard
2. **Test content extraction** - Try various newsletter platforms
3. **Update tests** - Add Readability tests to test suite
4. **Monitor errors** - Watch for pages Readability can't parse

---

**Engineering principle**: Fix the root cause, not the symptoms.
