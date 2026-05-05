-- =====================================================================
-- 0016_lottery.sql — 大屏抽奖 (issue #27)
-- =====================================================================
-- 设计要点：
--   1. winner 在 admin 点「开始抽奖」时由 server 已经选定写入 winner_user_id。
--      前端动画只是视觉表演，无法影响结果（防作弊）。
--   2. lottery_draws 不进 publication，anon 读不到 — pool_user_ids 列表
--      包含所有候选 user_id，泄露面会扩大现场可见范围。/screen 通过
--      service_role 服务端读取（fetchScreenData）。
--   3. event_state.lottery_draw_id 引用当前抽奖行；event_state 已经在
--      publication 里，所以 /screen 切模式 + 抽奖切换都靠这一条 broadcast 触发。
--   4. status 字段不要 — 有 winner_user_id 就代表已经定。重抽 = 新建一行。
--   5. 排除上轮中奖者 = 看历史 lottery_draws.winner_user_id 排除即可。

create table lottery_draws (
  id bigserial primary key,
  -- {must_have_posted: bool, exclude_previous_winners: bool}
  rules jsonb not null default '{}'::jsonb,
  -- 抽签时刻的候选池快照（uuid 数组），动画用
  pool_user_ids uuid[] not null,
  -- 服务端在 insert 时已选好；动画只是视觉
  winner_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index lottery_draws_created_at_idx on lottery_draws (created_at desc);
create index lottery_draws_winner_idx on lottery_draws (winner_user_id);

-- event_state 加 lottery_draw_id 字段
alter table event_state add column lottery_draw_id bigint
  references lottery_draws(id) on delete set null;

-- 重写 mode 一致性约束，包含 lottery 分支
alter table event_state drop constraint event_state_qa_host_consistency;
alter table event_state add constraint event_state_mode_consistency check (
  (screen_mode = 'qa'      and qa_host_user_id is not null and lottery_draw_id is null)
  or (screen_mode = 'lottery' and qa_host_user_id is null     and lottery_draw_id is not null)
  or (screen_mode = 'default' and qa_host_user_id is null     and lottery_draw_id is null)
);

-- RLS 启用但不写 anon policy = anon 完全读不到（pool_user_ids 隐私）
alter table lottery_draws enable row level security;

-- 注意：不要 alter publication add table lottery_draws —— 隐私 + 不需要
-- 客户端订阅，/screen 走 event_state.lottery_draw_id 触发服务端 refetch。
