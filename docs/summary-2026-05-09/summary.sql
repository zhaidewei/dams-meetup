-- ============================================================
-- DAMS Meetup #14 — 活动总结 SQL（2026-05-09）
-- ============================================================
-- 单条多 section 查询，每 section 输出一行 (section_name text, data jsonb)
-- 直接在 Supabase SQL Editor / psql 跑。结果 ~13 行，复制 jsonb 列即可。
--
-- 活动窗口：2026-05-09 12:45 ~ 18:00 Europe/Amsterdam
--          = 2026-05-09 10:45 ~ 16:00 UTC
-- ============================================================

with
event_window as (
  select
    '2026-05-09 12:45:00+02:00'::timestamptz as t_start,
    '2026-05-09 18:00:00+02:00'::timestamptz as t_end
),

-- ====== 1. 用户概览 ======
user_overview as (
  select jsonb_build_object(
    'total_users',         count(*),
    'vip_count',           count(*) filter (where is_vip),
    'new_during_event',    count(*) filter (
      where created_at >= (select t_start from event_window)
        and created_at <  (select t_end   from event_window)),
    'has_nickname',        count(*) filter (where nickname is not null and nickname <> ''),
    'has_company',         count(*) filter (where company  is not null and company  <> ''),
    'has_contact',         count(*) filter (where contact_handle is not null and contact_handle <> ''),
    'ai_consented',        count(*) filter (where ai_consent_at is not null),
    'seen_during_event',   count(*) filter (
      where last_seen_at >= (select t_start from event_window)
        and last_seen_at <  (select t_end   from event_window))
  ) as data
  from users
),

-- ====== 2. 在线人数时间序列（5min 桶，按 /feed last_seen 计） ======
online_timeseries as (
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'users', c) order by bucket), '[]'::jsonb) as data
  from (
    select
      date_trunc('minute', last_seen_at) - ((extract(minute from last_seen_at)::int % 5) || ' minutes')::interval as bucket,
      count(distinct id) as c
    from users
    where last_seen_at >= (select t_start from event_window)
      and last_seen_at <  (select t_end   from event_window)
    group by 1
  ) t
),

-- ====== 3. 帖子总量 + 分类型分板块 ======
post_overview as (
  select jsonb_build_object(
    'total_posts',     count(*),
    'text_posts',      count(*) filter (where type = 'text'),
    'poll_posts',      count(*) filter (where type = 'poll'),
    'with_match_intent', (select count(*) from post_match_intents),
    'during_event',    count(*) filter (
      where created_at >= (select t_start from event_window)
        and created_at <  (select t_end   from event_window))
  ) as data
  from posts
),

-- ====== 4. 板块分布 ======
section_breakdown as (
  select coalesce(jsonb_object_agg(coalesce(section, 'null'), c), '{}'::jsonb) as data
  from (
    select section, count(*) as c
    from posts
    group by section
  ) t
),

-- ====== 5. 互动总量 ======
interaction_overview as (
  select jsonb_build_object(
    'likes_total',       (select count(*) from likes),
    'replies_total',     (select count(*) from replies),
    'replies_human',     (select count(*) from replies where is_ai = false),
    'replies_ai',        (select count(*) from replies where is_ai = true),
    'poll_votes_total',  (select count(*) from poll_votes),
    'dm_messages_total', (select count(*) from dm_messages),
    'dm_threads_total',  (select count(*) from dm_threads)
  ) as data
),

-- ====== 6. AI 撮合执行情况（match_runs） ======
match_runs_overview as (
  select jsonb_build_object(
    'total_runs',          count(*),
    'success_runs',        count(*) filter (where status = 'success'),
    'skipped_low_intent',  count(*) filter (where status = 'skipped_low_intent'),
    'failed_runs',         count(*) filter (where status = 'failed'),
    'admin_triggered',     count(*) filter (where trigger = 'admin'),
    'cron_triggered',      count(*) filter (where trigger = 'cron'),
    'sum_posts_processed', coalesce(sum(posts_processed), 0),
    'sum_replies_inserted',coalesce(sum(replies_inserted), 0),
    'first_run_at',        min(started_at),
    'last_run_at',         max(started_at)
  ) as data
  from match_runs
),

-- ====== 7. AI 撮合实际结果（replies where is_ai） ======
ai_match_outcomes as (
  select jsonb_build_object(
    'ai_replies_total',         count(*),
    'distinct_target_posts',    count(distinct post_id),
    'distinct_mentioned_users', count(distinct mentioned_user_id),
    'visibility_public',        count(*) filter (where visibility = 'public'),
    'visibility_author_only',   count(*) filter (where visibility = 'author_only')
  ) as data
  from replies
  where is_ai = true
),

-- ====== 8. Top 10 点赞最多的帖子 ======
top_liked_posts as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.like_count desc, t.created_at asc), '[]'::jsonb) as data
  from (
    select
      p.id,
      p.section,
      p.type,
      p.body,
      p.like_count,
      (select count(*) from replies r where r.post_id = p.id and r.is_ai = false and r.visibility = 'public') as reply_count,
      coalesce(u.vip_name, nullif(u.nickname, ''), '匿名') as author_name,
      u.company as author_company,
      u.is_vip,
      p.created_at
    from posts p
    left join users u on u.id = p.user_id
    order by p.like_count desc, p.created_at asc
    limit 10
  ) t
),

-- ====== 9. Top 10 回复最多的帖子（人类公开 reply） ======
top_replied_posts as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.reply_count desc, t.created_at asc), '[]'::jsonb) as data
  from (
    select
      p.id,
      p.section,
      p.body,
      p.like_count,
      (select count(*) from replies r where r.post_id = p.id and r.is_ai = false and r.visibility = 'public') as reply_count,
      coalesce(u.vip_name, nullif(u.nickname, ''), '匿名') as author_name,
      u.is_vip,
      p.created_at
    from posts p
    left join users u on u.id = p.user_id
    order by reply_count desc, p.created_at asc
    limit 10
  ) t
  where t.reply_count > 0
),

-- ====== 10. Top 10 投票数最高的 poll ======
top_polls as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.vote_count desc), '[]'::jsonb) as data
  from (
    select
      p.id,
      p.body,
      p.poll_multi,
      (select count(*) from poll_votes v where v.post_id = p.id) as vote_count,
      (select count(distinct user_id) from poll_votes v where v.post_id = p.id) as voter_count,
      coalesce(u.vip_name, nullif(u.nickname, ''), '匿名') as author_name,
      p.created_at
    from posts p
    left join users u on u.id = p.user_id
    where p.type = 'poll'
    order by vote_count desc
    limit 10
  ) t
),

-- ====== 11. Top 10 高产用户（按发帖 + 回复加权） ======
top_users as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.score desc), '[]'::jsonb) as data
  from (
    select
      coalesce(u.vip_name, nullif(u.nickname, ''), '匿名') as name,
      u.company,
      u.is_vip,
      (select count(*) from posts   p where p.user_id = u.id) as posts,
      (select count(*) from replies r where r.user_id = u.id and r.is_ai = false) as replies,
      (select coalesce(sum(p.like_count), 0) from posts p where p.user_id = u.id) as likes_received,
      (select count(*) from posts   p where p.user_id = u.id) * 3
      + (select count(*) from replies r where r.user_id = u.id and r.is_ai = false) * 1
      + (select coalesce(sum(p.like_count), 0) from posts p where p.user_id = u.id) * 1
        as score
    from users u
    where exists (select 1 from posts p where p.user_id = u.id)
       or exists (select 1 from replies r where r.user_id = u.id and r.is_ai = false)
    order by score desc
    limit 10
  ) t
),

-- ====== 12. 抽奖记录 ======
lottery_records as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at), '[]'::jsonb) as data
  from (
    select
      l.id,
      l.created_at,
      l.closed_at,
      array_length(l.pool_user_ids, 1) as pool_size,
      coalesce(u.vip_name, nullif(u.nickname, ''), '匿名') as winner_name,
      u.company as winner_company
    from lottery_draws l
    left join users u on u.id = l.winner_user_id
    order by l.created_at
  ) t
)

-- ====== 汇总输出 ======
select 'event_window'         as section, jsonb_build_object('start', t_start, 'end', t_end) as data from event_window
union all select '01_user_overview',         data from user_overview
union all select '02_online_timeseries',     data from online_timeseries
union all select '03_post_overview',         data from post_overview
union all select '04_section_breakdown',     data from section_breakdown
union all select '05_interaction_overview',  data from interaction_overview
union all select '06_match_runs_overview',   data from match_runs_overview
union all select '07_ai_match_outcomes',     data from ai_match_outcomes
union all select '08_top_liked_posts',       data from top_liked_posts
union all select '09_top_replied_posts',     data from top_replied_posts
union all select '10_top_polls',             data from top_polls
union all select '11_top_users',             data from top_users
union all select '12_lottery_records',       data from lottery_records
order by section;
