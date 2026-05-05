-- =====================================================================
-- 0017_qa_answered_archive.sql — QA 结束归档 + 已答标记 (issue #29)
-- =====================================================================
-- 两件事同 PR 解决：
--   1. QA 结束后 /feed 仍能看到「上一轮 QA」展开区块 — 加
--      event_state.last_qa_host_user_id，exit 时把当前 host 搬过去。
--   2. 多轮 QA 老问题霸占顶 5 — 加 posts.answered_at；admin 标记
--      已答的问题不再上大屏，给新问题腾位。

-- 1. event_state.last_qa_host_user_id
alter table event_state add column last_qa_host_user_id uuid
  references users(id) on delete set null;

-- 2. posts.answered_at
alter table posts add column answered_at timestamptz;

-- 部分索引：大屏 QaSlot 热路径 — 取某 host 的未答问题。
create index posts_unanswered_question_idx
  on posts (question_target_user_id, created_at desc)
  where type = 'question' and answered_at is null;

-- posts 已经在 publication 里（migration 0002），所以 answered_at 字段
-- update 后会自动通过 posts 行 broadcast 给 anon。/feed 和 /screen
-- 都订阅 posts，标记后会自动 router.refresh()，无需额外配置。
