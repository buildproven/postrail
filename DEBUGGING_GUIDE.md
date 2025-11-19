# LetterFlow Debugging Guide

## ✅ Current Status

### What's Working:
1. **URL Scraping** - Mozilla Readability is successfully extracting newsletter content
2. **AI Generation** - Claude API is generating posts correctly (verified with `test-generation.js`)
3. **Environment Variables** - `.env.local` is loaded with Anthropic and Supabase keys
4. **Dev Server** - Running on http://localhost:3002

### What's NOT Working:
**Generated social posts are not appearing on the preview page**

---

## 🔍 Where the Issue Likely Is

Since AI generation works (tested independently), the problem is in one of these areas:

1. **Post Saving** - The `/api/generate-posts` route may be failing to save posts to Supabase
2. **Row Level Security** - Supabase RLS policies may be blocking post reads
3. **Preview Page Query** - The database query might have an issue

---

## 🧪 How to Debug

### Step 1: Check the Generation API

Open your browser to http://localhost:3002 and:

1. Navigate to `/dashboard/newsletters/new`
2. Import a newsletter URL (or paste content manually)
3. Click "Generate Social Posts"
4. **Open Browser DevTools** (F12 or Cmd+Option+I)
5. Go to **Network** tab
6. Look for the POST request to `/api/generate-posts`
7. Check the response:

**If SUCCESS (Status 200):**
```json
{
  "newsletterId": "uuid-here",
  "postsGenerated": 6,
  "posts": [
    { "platform": "linkedin", "postType": "pre_cta", "content": "..." },
    ...
  ]
}
```

**If FAILURE (Status 500):**
```json
{
  "error": "Server configuration error: ANTHROPIC_API_KEY not set"
}
```
OR
```json
{
  "error": "Failed to save generated posts"
}
```

### Step 2: Check the Preview Page

After generation (successful or not), you'll be redirected to:
`/dashboard/newsletters/[id]/preview`

**Look for the DEBUG warnings I just added:**

**Yellow Warning Box** = Posts were not saved OR Row Level Security is blocking them:
```
⚠️ No posts found for this newsletter
Newsletter ID: abc-123-def

This might mean:
- Post generation failed during creation
- Row Level Security is blocking access
- Posts were saved under a different newsletter ID
```

**Red Error Box** = Database query failed:
```
❌ Error fetching posts:
{ "code": "...", "message": "..." }
```

### Step 3: Check Server Logs

While on the preview page, check the **Terminal** where `npm run dev` is running.

Look for these DEBUG lines:
```
DEBUG - Newsletter ID: abc-123-def
DEBUG - Posts: null  (or) [ {...}, {...} ]
DEBUG - Posts error: null  (or) { code: "...", message: "..." }
DEBUG - Posts count: 0  (or) 6
```

This tells you:
- **Posts count: 0** = No posts in database for this newsletter
- **Posts error: {...}** = RLS policy or query issue
- **Posts: [{...}, {...}]** = Posts ARE in database (display issue)

---

## 🔧 Common Fixes

### Issue 1: Posts Not Saving (API Route Failure)

**Symptoms:**
- Network tab shows 500 error on `/api/generate-posts`
- Console logs show "Failed to save generated posts"

**Fix:**
Check the API route at `app/api/generate-posts/route.ts:243-256`

The route creates the newsletter, generates posts, then saves them. If saving fails, it should rollback the newsletter creation.

Check if Supabase RLS policies allow INSERT on `social_posts` table:

```sql
-- Run in Supabase SQL Editor
SELECT * FROM pg_policies
WHERE tablename = 'social_posts'
AND policyname LIKE '%insert%';
```

Expected policy:
```sql
create policy "Users can insert posts for their newsletters"
  on public.social_posts for insert
  with check (
    exists (
      select 1 from public.newsletters
      where newsletters.id = social_posts.newsletter_id
      and newsletters.user_id = auth.uid()
    )
  );
```

### Issue 2: Row Level Security Blocking Reads

**Symptoms:**
- Posts ARE being created (check Supabase Table Editor → social_posts)
- But preview page shows "⚠️ No posts found"
- DEBUG logs show `Posts: null` or `Posts: []`

**Fix:**
Check RLS SELECT policy on `social_posts`:

```sql
-- Run in Supabase SQL Editor
SELECT * FROM pg_policies
WHERE tablename = 'social_posts'
AND policyname LIKE '%select%';
```

Expected policy:
```sql
create policy "Users can view posts from their newsletters"
  on public.social_posts for select
  using (
    exists (
      select 1 from public.newsletters
      where newsletters.id = social_posts.newsletter_id
      and newsletters.user_id = auth.uid()
    )
  );
```

**Quick Test:**
Disable RLS temporarily to confirm:
```sql
ALTER TABLE public.social_posts DISABLE ROW LEVEL SECURITY;
```

Refresh the preview page. If posts now appear, the issue is the RLS policy.

**Re-enable RLS after testing:**
```sql
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
```

### Issue 3: Auth UID Mismatch

**Symptoms:**
- Newsletter created with one user_id
- Preview page tries to fetch with different user_id
- DEBUG shows `Posts: []` (empty array, not null)

**Fix:**
Check if the logged-in user matches the newsletter owner:

```sql
-- Run in Supabase SQL Editor (replace uuid with actual ID)
SELECT
  n.id,
  n.user_id as newsletter_owner,
  (SELECT auth.uid()) as current_user,
  n.user_id = auth.uid() as is_owner
FROM newsletters n
WHERE n.id = 'your-newsletter-id-here';
```

If `is_owner` is FALSE, you're logged in as a different user.

---

## 🎯 Next Steps (In Order)

1. **Run the test again**:
   ```bash
   node test-generation.js
   ```
   ✅ Confirms AI is working

2. **Open the app**: http://localhost:3002

3. **Try creating a newsletter**:
   - Use URL: `https://example.com/newsletter` (or any URL)
   - OR paste content manually
   - Click "Generate Social Posts"

4. **Check Network tab** for `/api/generate-posts` response

5. **Check preview page** for debug warnings

6. **Check terminal** for DEBUG logs

7. **Check Supabase** Table Editor → `social_posts` table
   - Are there rows with your `newsletter_id`?

8. **Report back** what you see in each step

---

## 📝 Quick Test Script

I've created `test-generation.js` which confirms the AI API works.

**Run it:**
```bash
node test-generation.js
```

**Expected output:**
```
✅ SUCCESS! Generated post:
────────────────────────────────────────────────────────────
🚀 **The 30-Day SaaS Challenge is ending in 72 hours...**
...
────────────────────────────────────────────────────────────
📊 Character count: 1429 / 3000
📊 Percentage: 48%
✅ Post is within safe character limit
```

If this works (it does), the problem is 100% in database saving/fetching, not AI generation.

---

## 💡 Pro Tip: Use Supabase Realtime Inspector

While testing, open another tab to:
https://supabase.com/dashboard/project/[your-project]/editor

1. Go to **Table Editor**
2. Click `social_posts` table
3. Keep it open while you generate posts
4. Refresh after clicking "Generate Social Posts"
5. See if rows appear in realtime

If rows appear = Saving works, fetching is broken
If no rows = Saving is broken

---

## 🔗 Relevant Files

- API Route: `app/api/generate-posts/route.ts`
- Preview Page: `app/dashboard/newsletters/[id]/preview/page.tsx`
- Database Schema: `docs/SETUP_SUPABASE.md`
- Test Script: `test-generation.js`

---

**Let me know what you find!** 🚀
