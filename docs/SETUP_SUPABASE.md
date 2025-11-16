# Supabase Setup Guide

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New Project"
5. Fill in:
   - **Name**: letterflow
   - **Database Password**: (generate a strong password and save it)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is perfect for development

## Step 2: Get API Credentials

1. Go to **Project Settings** (gear icon in sidebar)
2. Click **API** in the left menu
3. Copy these values to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
```

## Step 3: Configure Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider (should be enabled by default)
3. Configure email templates (optional):
   - **Authentication** → **Email Templates**
   - Customize "Confirm signup" email

## Step 4: Setup Database Tables

Run this SQL in the **SQL Editor** (Database → SQL Editor):

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
  scheduled_time timestamp with time zone,
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

## Step 5: Test Connection

1. Start your dev server:
```bash
npm run dev
```

2. Go to http://localhost:3000/auth/signup
3. Create a test account
4. Check your email for confirmation
5. Click the confirmation link
6. You should be redirected to the dashboard!

## Step 6: Verify Database

1. Go to **Database** → **Table Editor** in Supabase
2. You should see these tables:
   - `newsletters`
   - `social_posts`
   - `platform_connections`
   - `post_analytics`

## Common Issues

### Email not arriving
- Check **Authentication** → **Email Templates** → Make sure SMTP is configured
- For development, check the **Logs** tab for email debug info
- Supabase free tier sends emails from their domain (works for testing)

### "Invalid API key" error
- Make sure you copied the **anon/public** key, not the service_role key
- Check there are no extra spaces in `.env.local`
- Restart your dev server after changing `.env.local`

### RLS policies blocking access
- Make sure you're logged in
- Check the browser console for detailed error messages
- Verify policies are created correctly in SQL Editor

## Next Steps

Once Supabase is working:
1. Test signup/login flow
2. Verify you can access the dashboard
3. Move on to implementing newsletter input (Week 2)

---

**Supabase is now ready!** 🎉

The authentication system is complete and you can create accounts, log in, and access the protected dashboard.
