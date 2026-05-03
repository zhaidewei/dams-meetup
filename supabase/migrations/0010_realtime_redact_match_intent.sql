-- =====================================================================
-- 0010_realtime_redact_match_intent.sql — 给 posts 的 Realtime 广播加列白名单
-- =====================================================================
-- 背景：posts.match_intent 是用户私下提交给 LLM 的撮合需求，仅 author + LLM
-- 可见。Migration 0002 把 posts 全表加进了 supabase_realtime publication，
-- 意味着 anon 客户端订阅 posts 时会收到所有列 —— match_intent 会泄漏。
--
-- 三种修复路径里选 column list（PG 15 起支持）：
--   - RLS 只能过滤行、不过滤列，不行
--   - View 不能加进 logical replication publication，不行
--   - Publication 列白名单 在 wal2json 解码层就把列剥掉，最稳
--
-- 注意：UPDATE / DELETE 的 replica identity（默认 = primary key id）总是被
-- 复制，列白名单包含 id 即可；不会破坏 UPDATE / DELETE broadcast。
--
-- 维护提醒：以后给 posts 加 **公开** 字段时，记得把字段名追加到下面的列表。
-- 加 **私密** 字段时，不要追加。

alter publication supabase_realtime drop table posts;

alter publication supabase_realtime add table posts (
  id, user_id, type, body, tags, show_contact, section,
  poll_options, poll_multi, poll_deadline, poll_hide_results,
  created_at
);
