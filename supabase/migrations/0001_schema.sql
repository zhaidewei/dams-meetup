-- DAMS Meetup #14 — schema
-- Identity model: browser UUID, no Supabase Auth.
-- All writes go through Next.js server (service role key bypasses RLS).
-- Anon key is used only for client-side Realtime subscriptions (read-only).

create extension if not exists pgcrypto;

-- =====================================================================
-- users: browser identities (not auth users)
-- =====================================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  nickname text,                      -- self-set; null => "匿名"
  company text,
  contact_handle text,                -- LinkedIn URL / email / wechat id
  show_contact boolean not null default false,
  recovery_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  is_vip boolean not null default false,
  vip_name text,                      -- overrides nickname for VIPs
  vip_title text,                     -- e.g., "ASML 资深工程师"
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- =====================================================================
-- posts: single timeline (text + poll types)
-- =====================================================================
create table posts (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('text', 'poll')),
  body text not null check (char_length(body) <= 300),
  tags text[] not null default '{}',
  show_contact boolean not null default false,
  -- poll-specific (null for text)
  poll_options jsonb,                 -- [{"id":1,"label":"..."}]
  poll_multi boolean,
  poll_deadline timestamptz,
  poll_hide_results boolean,
  created_at timestamptz not null default now()
);

create index posts_created_at_idx on posts (created_at desc);
create index posts_tags_gin on posts using gin (tags);

-- =====================================================================
-- replies: flat replies under a post
-- =====================================================================
create table replies (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) <= 300),
  created_at timestamptz not null default now()
);

create index replies_post_id_idx on replies (post_id, created_at);

-- =====================================================================
-- likes
-- =====================================================================
create table likes (
  user_id uuid not null references users(id) on delete cascade,
  post_id bigint not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index likes_post_id_idx on likes (post_id);

-- =====================================================================
-- poll_votes
-- =====================================================================
create table poll_votes (
  user_id uuid not null references users(id) on delete cascade,
  post_id bigint not null references posts(id) on delete cascade,
  option_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id, option_id)
);

create index poll_votes_post_id_idx on poll_votes (post_id);

-- =====================================================================
-- vip_tokens: organizer pre-issues, VIP claims by visiting URL with ?vip=<token>
-- =====================================================================
create table vip_tokens (
  token text primary key,
  vip_name text not null,
  vip_title text,
  user_id uuid references users(id),  -- linked when first claimed
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- =====================================================================
-- matches: AI-computed recommendations (written by edge function)
-- Read by /matches page. If empty for a user, UI shows graceful empty state.
-- =====================================================================
create table matches (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  matched_post_id bigint not null references posts(id) on delete cascade,
  score real,
  reason text,
  computed_at timestamptz not null default now(),
  unique (user_id, matched_post_id)
);

create index matches_user_id_idx on matches (user_id, score desc);

-- =====================================================================
-- RLS: enabled on all tables. Service role (server) bypasses RLS.
-- Anon role (client) gets read-only on most tables for Realtime.
-- =====================================================================
alter table users        enable row level security;
alter table posts        enable row level security;
alter table replies      enable row level security;
alter table likes        enable row level security;
alter table poll_votes   enable row level security;
alter table vip_tokens   enable row level security;
alter table matches      enable row level security;

-- Anon reads: timeline content is publicly readable (after password gate at app level)
create policy "anon read posts"      on posts      for select to anon using (true);
create policy "anon read replies"    on replies    for select to anon using (true);
create policy "anon read likes"      on likes      for select to anon using (true);
create policy "anon read poll_votes" on poll_votes for select to anon using (true);
create policy "anon read matches"    on matches    for select to anon using (true);
-- users table: only the row matching client's UUID readable would require auth.
-- We expose a minimal view instead (see below).
-- vip_tokens: never anon-readable.

-- Public view exposing only post-display fields from users (joined into queries)
create view public_user_display as
select id, nickname, company, contact_handle, show_contact,
       is_vip, vip_name, vip_title
from users;

grant select on public_user_display to anon;

-- All writes happen via service role from Next.js server actions; no anon write policies.
