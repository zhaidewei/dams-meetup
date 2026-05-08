-- =====================================================================
-- 0021_lottery_v2.sql — 抽奖 v2：演到停才定 + 加权 + 透明池子
-- =====================================================================
-- 设计文档：docs/lottery-design-v2.md
--
-- 与 v1（migration 0016）的关系：
--   - 不删旧字段；winner_user_id 由 NOT NULL 改成 nullable，新增
--     closed_at / pool_weights / random_seed。v1 已写入的旧行（winner
--     不为 null 但 closed_at 为 null）用 backfill 一次补齐。
--   - event_state_mode_consistency 约束不动 —— 它只看 lottery_draw_id
--     是否非 null，不管 winner 是否落定。
--   - lottery_draws 仍然不进 publication（D2 提到 pool 透明，但走服务端
--     fetchScreenData 即可，不需要 anon broadcast；新增 closed_at 也是
--     在 server action 同事务内已知，无须广播）。
--
-- 关键 RPC：compute_lottery_pool —— 取代 v1 客户端两次 IN() 查询，
-- 在 DB 一次跑完所有 filter + 权重计算。彻底解决：
--   1. PostgREST URL 长度上限（pool 大时 IN(...) 超 8KB）
--   2. PostgREST 默认 1000 行 cap（posts 表行数大时被静默截断）
--   3. distinct 缺失（v1 拉所有 posts 行回 server JS dedupe）
-- =====================================================================

-- 1. 表结构改造
alter table lottery_draws
  alter column winner_user_id drop not null;

alter table lottery_draws
  add column if not exists closed_at timestamptz,
  add column if not exists pool_weights jsonb not null default '{}'::jsonb,
  add column if not exists random_seed bytea;

-- 2. 旧行 backfill —— 必须在 add constraint 之前
--    v1 已写入的行 winner_user_id 非 null 但 closed_at 还是 null。
--    若先 add constraint 再 backfill，约束立即扫表 → 判违约 → 整个 migration
--    回滚（DDL + DML 在同一事务里）→ 看似失败实际啥也没改。
update lottery_draws set closed_at = created_at where closed_at is null and winner_user_id is not null;

-- 3. closed/winner 状态一致性 —— 要么都 null（spinning），要么都非 null（settled）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lottery_draws_close_consistency'
  ) then
    alter table lottery_draws add constraint lottery_draws_close_consistency check (
      (closed_at is null and winner_user_id is null)
      or (closed_at is not null and winner_user_id is not null)
    );
  end if;
end $$;

-- 4. RPC: compute_lottery_pool
--    rules 字段：
--      must_have_posted        bool  默认 false  // 帖/回复/投票任一即可
--      exclude_previous_winners bool 默认 true
--      exclude_vips            bool  默认 true
--      enable_weights          bool  默认 true   // 关掉则全员 1 票
--      online_window_seconds   int   默认 600    // 10 分钟
--    返回：(user_id uuid, weight int)
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
      coalesce((rules->>'online_window_seconds')::int, 600)       as window_s
  ),
  online as (
    select u.id, u.is_vip
    from users u, cfg
    where u.last_seen_at >= now() - make_interval(secs => cfg.window_s)
  ),
  -- 帖/回复/投票任一参与的 user 集合
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
  -- 经过 filter 的 candidate uid 集合
  filtered as (
    select o.id
    from online o, cfg
    where (not cfg.exclude_vips or not o.is_vip)
      and (not cfg.must_have_posted or o.id in (select user_id from participated))
      and (not cfg.exclude_prev    or o.id not in (select user_id from prev_winners))
  ),
  -- 加权信号
  posters as (
    select distinct user_id from posts where type = 'post'
  ),
  replied_targets as (
    -- 被回复过 ≥1 次的 post 作者
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

comment on function compute_lottery_pool(jsonb) is
  '抽奖 v2 池子 + 权重一次算完。详见 docs/lottery-design-v2.md §3.3 和 §5。';

-- 5. service_role 显式授权（其它 role 走 RLS，但本函数只在 startLotteryAction
--    通过 service role 调用，client/anon 不需要也不应能调）
revoke all on function compute_lottery_pool(jsonb) from public;
grant execute on function compute_lottery_pool(jsonb) to service_role;
