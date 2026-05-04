-- =====================================================================
-- 0013_last_seen_me.sql — Header 红点合并（issue #18 必做 A）
-- =====================================================================
-- 给 users 加一个 last_seen_me_at：上一次访问 /me 的时间戳。
-- 用于 Header 红点：未读回复 / 未读 AI 提及 = created_at > last_seen_me_at 的计数。
--
-- 跟 last_seen_at（5 分钟在线人数窗口）语义不同，必须独立字段，
-- 否则用户在 /feed 上活跃就会清空"我"tab 红点。

alter table users
  add column if not exists last_seen_me_at timestamptz not null default now();
