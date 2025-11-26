-- Generation jobs table for queued AI post generation
create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  content text not null,
  content_hash text,
  status text not null default 'pending', -- pending|completed|failed|retry
  result jsonb,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists generation_jobs_user_id_idx on public.generation_jobs(user_id);
create index if not exists generation_jobs_status_idx on public.generation_jobs(status);
create index if not exists generation_jobs_content_hash_idx on public.generation_jobs(content_hash);

-- Row Level Security
alter table public.generation_jobs enable row level security;

-- Owners can see their own jobs
create policy if not exists generation_jobs_select_self
  on public.generation_jobs for select
  using (auth.uid() = user_id);

-- Owners can insert their own jobs
create policy if not exists generation_jobs_insert_self
  on public.generation_jobs for insert
  with check (auth.uid() = user_id);

-- Owners can update only their jobs (typically not used; worker updates with service role)
create policy if not exists generation_jobs_update_self
  on public.generation_jobs for update
  using (auth.uid() = user_id);

-- Service role bypasses RLS; ensure SUPABASE_SERVICE_ROLE_KEY is used by worker

-- Trigger to keep updated_at fresh
create or replace function public.touch_generation_jobs()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generation_jobs_updated_at on public.generation_jobs;
create trigger trg_generation_jobs_updated_at
before update on public.generation_jobs
for each row
execute procedure public.touch_generation_jobs();
