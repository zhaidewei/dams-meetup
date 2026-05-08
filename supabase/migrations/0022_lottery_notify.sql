-- =====================================================================
-- 0022_lottery_notify.sql — 中奖私信通知
-- =====================================================================
-- 设计：复用 DM 链路（migration 0012）给中奖者发一条系统私信。
--   1. dm_messages 不进 publication，body 私密
--   2. dm_notifications 进 publication，drives winner 端 DmRealtime
--      router.refresh() → Header 红点 + /me 列表显示新对话
--
-- 发件方：本 migration 插入一行专用 system user（contact_handle =
-- 'SYSTEM-LOTTERY'）。resolveLotteryAction 通过该 handle 查 id，绕开硬
-- 编码 uuid。不在 lottery_draws 上加 sender 列，避免污染抽奖 schema。
--
-- 幂等：用 NOT EXISTS gate 而不是 ON CONFLICT，因为 users.contact_handle
-- 没 unique 约束（业务前缀约定，不强制）。重跑 migration 安全。

insert into users (contact_handle, nickname)
select 'SYSTEM-LOTTERY', '🎉 抽奖通知'
where not exists (
  select 1 from users where contact_handle = 'SYSTEM-LOTTERY'
);

-- compute_lottery_pool 修订：排除 SYSTEM-* user，避免 system 通知账号自己
-- 被抽中（它默认 last_seen_at=now() + nickname 非 null，原 RPC 会把它当
-- 普通用户）。修改幅度：在 online CTE 里加一条 contact_handle 过滤。
create or replace function compute_lottery_pool(rules jsonb)
returns table (user_id uuid, weight int)
language sql
stable
as $$
  with cfg as (
    select
      coalesce((rules->>'must_have_posted')::bool, false)         as must_have_posted,
      coalesce((rules->>'exclude_previous_winners')::bool, true)  as exclude_prev,
      coalesce((rules->>'exclude_vips')::bool, true)              as exclude_vips,
      coalesce((rules->>'enable_weights')::bool, true)            as enable_weights,
      coalesce((rules->>'online_window_seconds')::int, 3600)      as window_s
  ),
  online as (
    select u.id, u.is_vip
    from users u, cfg
    where u.last_seen_at >= now() - make_interval(secs => cfg.window_s)
      -- 排除系统账号（contact_handle 以 SYSTEM- 开头）
      and (u.contact_handle is null or u.contact_handle not like 'SYSTEM-%')
  ),
  participated as (
    select user_id from posts
    union
    select user_id from replies
    union
    select user_id from poll_votes
  ),
  prev_winners as (
    select winner_user_id as user_id
    from lottery_draws
    where winner_user_id is not null
  ),
  filtered as (
    select o.id
    from online o, cfg
    where (not cfg.exclude_vips or not o.is_vip)
      and (not cfg.must_have_posted or o.id in (select user_id from participated))
      and (not cfg.exclude_prev    or o.id not in (select user_id from prev_winners))
  ),
  posters as (
    select distinct user_id from posts where type = 'post'
  ),
  replied_targets as (
    select distinct p.user_id
    from posts p
    join replies r on r.post_id = p.id
  )
  select
    f.id as user_id,
    case when (select enable_weights from cfg)
      then 1
        + (case when f.id in (select user_id from posters)         then 1 else 0 end)
        + (case when f.id in (select user_id from replied_targets) then 1 else 0 end)
      else 1
    end as weight
  from filtered f;
$$;
