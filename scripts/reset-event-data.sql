-- ============================================================
-- DAMS Meetup — 活动结束后清空所有运行数据
-- ============================================================
-- 何时跑：本届活动落幕、复盘 SQL（docs/summary-2026-05-09/summary.sql）
-- 已经导出、result.json + index.html 已经归档之后；准备下一届前。
--
-- 这份脚本只清空数据，不动 schema。
-- 跑完之后：
--   - users / posts / replies / likes / poll_votes / dm_* / lottery_*
--     / match_runs / matches / post_match_intents 全部清空，bigserial 重置
--   - vip_tokens 清空（下一届要重新签发）
--   - event_state 单行重置为初始值（singleton 不能 truncate，所以 update）
--
-- 不清的：
--   - 系统 user（lottery 通知用，contact_handle = SYSTEM-LOTTERY）
--     如果未来某届想保留 / 重置，自行决定。这里默认一起清，
--     下一届启动时 migration 0022 会重新插。
--
-- 跑法（任选其一）：
--   1) Supabase SQL Editor 直接粘贴执行
--   2) psql：
--        PGPASSWORD="$(secret get supabase-dams-db-password)" \
--        psql "$(secret get supabase-dams-url | sed 's,^https://,postgresql://postgres@,;s,$,/postgres,')" \
--          -f scripts/reset-event-data.sql
--
-- ⚠️ 不可逆。确认 summary 已经导出再跑。
-- ============================================================

begin;

-- 1) 业务事实表 — TRUNCATE CASCADE + RESTART IDENTITY 一次性清光
--    顺序无所谓，CASCADE 会自动处理外键链。
--    注意：`matches` 表已在 migration 0004 被 drop（F'' 后撮合结果存进 replies）。
truncate table
  lottery_draws,
  dm_notifications,
  dm_messages,
  dm_threads,
  match_runs,
  post_match_intents,
  poll_votes,
  likes,
  replies,
  posts,
  vip_tokens,
  users
restart identity cascade;

-- 2) event_state 是 singleton（check id=1），不能 truncate，改成 update。
--    列清单见 migrations 0014/0015/0016/0019_qa_section/0024/0026。
update event_state
set
  current_section        = null,
  override_until         = null,
  screen_mode            = 'default',
  qa_host_user_id        = null,
  last_qa_host_user_id   = null,
  lottery_draw_id        = null,
  qa_section             = null,
  last_qa_section        = null,
  screen_filter_section  = null,
  qa_started_at          = null,
  updated_at             = now()
where id = 1;

-- 3) 校验
do $$
declare
  c_users  int;
  c_posts  int;
  c_state  int;
begin
  select count(*) into c_users from users;
  select count(*) into c_posts from posts;
  select current_section is null and lottery_draw_id is null
    into c_state from event_state where id = 1;
  raise notice 'reset done: users=% posts=% event_state_clean=%',
    c_users, c_posts, c_state;
  if c_users <> 0 or c_posts <> 0 then
    raise exception 'reset failed: tables not empty';
  end if;
end $$;

commit;
