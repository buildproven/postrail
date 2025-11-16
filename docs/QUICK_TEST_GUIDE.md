# Quick Test Guide - 5 Minutes to Working Auth

## Step 1: Create Supabase Project (2 minutes)

1. **Go to Supabase**:
   - Visit https://supabase.com
   - Click "Start your project"
   - Sign in with GitHub

2. **Create New Project**:
   - Click "New Project"
   - **Organization**: Select or create one
   - **Name**: `letterflow`
   - **Database Password**: Click "Generate a password" and **SAVE IT**
   - **Region**: Choose closest to you (e.g., US West)
   - **Pricing Plan**: Free
   - Click "Create new project"
   - **Wait ~2 minutes** for project to initialize

---

## Step 2: Get API Credentials (1 minute)

1. **Navigate to Settings**:
   - Click the **gear icon** (⚙️) in the left sidebar
   - Click **API** in the settings menu

2. **Copy Credentials**:
   - Find "Project URL" → Copy it
   - Find "Project API keys" → Copy the **`anon public`** key (NOT service_role)

3. **Update .env.local**:
   - Open `/Users/brettstark/Projects/letterflow/.env.local`
   - Replace these two lines:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     ```
   - With your actual values:
     ```
     NEXT_PUBLIC_SUPABASE_URL=https://[your-project-id].supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     ```

---

## Step 3: Setup Database (2 minutes)

1. **Open SQL Editor**:
   - Click **SQL Editor** in the left sidebar (icon looks like `</>`)
   - Click **+ New query**

2. **Copy & Paste SQL**:
   - Open the file below and copy ALL the SQL
   - See: `/Users/brettstark/Projects/letterflow/docs/SETUP_SUPABASE.md`
   - Or copy from here: [scroll down for SQL]

3. **Run the SQL**:
   - Paste into SQL Editor
   - Click "Run" (or press Cmd+Enter)
   - Wait for "Success. No rows returned"

4. **Verify Tables Created**:
   - Click **Table Editor** in sidebar
   - You should see 4 tables:
     - `newsletters`
     - `social_posts`
     - `platform_connections`
     - `post_analytics`

---

## Step 4: Restart Dev Server (30 seconds)

The dev server needs to reload the new environment variables:

1. **Stop the server**:
   ```bash
   # Find the process
   ps aux | grep "next dev"

   # Kill it (replace [PID] with the actual process ID)
   kill [PID]
   ```

2. **Restart it**:
   ```bash
   cd /Users/brettstark/Projects/letterflow
   npm run dev
   ```

3. **Wait for**:
   ```
   ✓ Ready in [time]
   ```

---

## Step 5: Test Authentication (1 minute)

1. **Open the app**:
   - Go to http://localhost:3000

2. **Click "Get Started"**:
   - Should take you to `/auth/signup`

3. **Create an account**:
   - Email: Use a real email you can access
   - Password: At least 6 characters
   - Click "Sign up"

4. **Check your email**:
   - Look for email from `noreply@mail.app.supabase.io`
   - Subject: "Confirm Your Signup"
   - Click the confirmation link

5. **Log in**:
   - Return to http://localhost:3000/auth/login
   - Enter your email and password
   - Click "Log in"

6. **Success!**:
   - You should be redirected to `/dashboard`
   - See your email in the top right
   - See "0 newsletters scheduled" card
   - See platform connection status

---

## Expected Results

✅ **If everything works**:
- You can sign up
- Email confirmation works
- You can log in
- Dashboard loads with your email
- You can log out
- Routes are protected (can't access `/dashboard` when logged out)

❌ **Common Issues**:

### "Invalid API key"
- Check you copied the **anon/public** key (not service_role)
- Remove any spaces from the key in `.env.local`
- Restart dev server

### Email not arriving
- Check spam folder
- Wait 2-3 minutes
- Supabase free tier can be slow with emails
- Alternative: Disable email confirmation:
  - Supabase → Authentication → Providers → Email
  - Turn off "Confirm email"

### Can't access dashboard after login
- Check browser console for errors
- Verify RLS policies were created in SQL
- Make sure all SQL ran successfully

### "User not found" on login
- Confirm your email first
- Check Supabase → Authentication → Users to see if account exists

---

## Quick SQL Copy (for Step 3)

```sql
-- Create newsletters table
create table public.newsletters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title varchar(500),
  content text not null,
  source_url varchar(2000),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  scheduled_send_time timestamp with time zone,
  status text check (status in ('draft', 'scheduled', 'sent')) default 'draft'
);

-- Create social_posts table
create table public.social_posts (
  id uuid default gen_random_uuid() primary key,
  newsletter_id uuid references public.newsletters on delete cascade not null,
  platform text check (platform in ('linkedin', 'threads', 'facebook')) not null,
  post_type text check (post_type in ('pre_cta', 'post_cta')) not null,
  content text not null,
  character_count integer,
  scheduled_time timestamp with time zone not null,
  published_at timestamp with time zone,
  status text check (status in ('draft', 'scheduled', 'published', 'failed')) default 'draft',
  error_message text,
  platform_post_id varchar(255)
);

-- Create platform_connections table
create table public.platform_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  platform text check (platform in ('linkedin', 'threads', 'facebook')) not null,
  oauth_token text not null,
  oauth_refresh_token text,
  token_expires_at timestamp with time zone,
  connected_at timestamp with time zone default timezone('utc'::text, now()) not null,
  is_active boolean default true,
  platform_user_id varchar(255),
  platform_username varchar(255),
  unique(user_id, platform)
);

-- Create post_analytics table
create table public.post_analytics (
  id uuid default gen_random_uuid() primary key,
  social_post_id uuid references public.social_posts on delete cascade not null,
  impressions integer default 0,
  engagements integer default 0,
  clicks integer default 0,
  shares integer default 0,
  comments integer default 0,
  last_synced_at timestamp with time zone
);

-- Enable Row Level Security (RLS)
alter table public.newsletters enable row level security;
alter table public.social_posts enable row level security;
alter table public.platform_connections enable row level security;
alter table public.post_analytics enable row level security;

-- Create policies for newsletters
create policy "Users can view their own newsletters"
  on public.newsletters for select
  using (auth.uid() = user_id);

create policy "Users can insert their own newsletters"
  on public.newsletters for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own newsletters"
  on public.newsletters for update
  using (auth.uid() = user_id);

create policy "Users can delete their own newsletters"
  on public.newsletters for delete
  using (auth.uid() = user_id);

-- Create policies for social_posts
create policy "Users can view posts from their newsletters"
  on public.social_posts for select
  using (
    exists (
      select 1 from public.newsletters
      where newsletters.id = social_posts.newsletter_id
      and newsletters.user_id = auth.uid()
    )
  );

create policy "Users can insert posts for their newsletters"
  on public.social_posts for insert
  with check (
    exists (
      select 1 from public.newsletters
      where newsletters.id = social_posts.newsletter_id
      and newsletters.user_id = auth.uid()
    )
  );

create policy "Users can update posts from their newsletters"
  on public.social_posts for update
  using (
    exists (
      select 1 from public.newsletters
      where newsletters.id = social_posts.newsletter_id
      and newsletters.user_id = auth.uid()
    )
  );

create policy "Users can delete posts from their newsletters"
  on public.social_posts for delete
  using (
    exists (
      select 1 from public.newsletters
      where newsletters.id = social_posts.newsletter_id
      and newsletters.user_id = auth.uid()
    )
  );

-- Create policies for platform_connections
create policy "Users can view their own platform connections"
  on public.platform_connections for select
  using (auth.uid() = user_id);

create policy "Users can insert their own platform connections"
  on public.platform_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own platform connections"
  on public.platform_connections for update
  using (auth.uid() = user_id);

create policy "Users can delete their own platform connections"
  on public.platform_connections for delete
  using (auth.uid() = user_id);

-- Create policies for post_analytics
create policy "Users can view analytics for their posts"
  on public.post_analytics for select
  using (
    exists (
      select 1 from public.social_posts
      join public.newsletters on newsletters.id = social_posts.newsletter_id
      where social_posts.id = post_analytics.social_post_id
      and newsletters.user_id = auth.uid()
    )
  );

create policy "Users can insert analytics for their posts"
  on public.post_analytics for insert
  with check (
    exists (
      select 1 from public.social_posts
      join public.newsletters on newsletters.id = social_posts.newsletter_id
      where social_posts.id = post_analytics.social_post_id
      and newsletters.user_id = auth.uid()
    )
  );

create policy "Users can update analytics for their posts"
  on public.post_analytics for update
  using (
    exists (
      select 1 from public.social_posts
      join public.newsletters on newsletters.id = social_posts.newsletter_id
      where social_posts.id = post_analytics.social_post_id
      and newsletters.user_id = auth.uid()
    )
  );
```

---

## After Testing Successfully

Once authentication works, you're ready to:
1. Start building Week 2 features (Newsletter input & AI)
2. Or explore the Supabase dashboard
3. Or customize the landing page

**Next command**:
```bash
/sc:implement "Newsletter input form with URL scraping and Claude AI post generation"
```

---

## Troubleshooting Help

If you run into issues during testing, let me know:
- What step you're on
- What error message you see
- Screenshots help!

I can help debug and get you unblocked quickly.

---

**Total time**: ~5-7 minutes to working authentication! 🚀
