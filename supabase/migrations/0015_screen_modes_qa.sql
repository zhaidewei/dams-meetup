-- =====================================================================
-- 0015_screen_modes_qa.sql — /screen 模式状态机 + QA 提问数据模型 (issue #27)
-- =====================================================================
-- 三种 screen_mode：
--   default — 默认骨架（大 QR + LIVE 板块演讲信息）
--   qa      — 嘉宾 QA 模式，主办方触发，观众端浮 banner「向 X 提问」
--   lottery — 抽奖模式（migration 0016 扩展）
--
-- QA host: event_state.qa_host_user_id 指向被提问的嘉宾 user。
-- 提问帖：posts.type='question' + posts.question_target_user_id 指向 host。
--
-- event_state 进 publication —— /screen 和 /feed 都需要在 admin 切模式时
-- 几乎实时反应。⚠️ 应用本 migration 后必须在 Supabase Dashboard
-- → Database → Publications → supabase_realtime 把 event_state toggle 一下
-- （关再开），否则 Realtime 内部状态不会重载（已踩过的坑）。

-- 1. event_state 加 screen_mode + qa_host_user_id
alter table event_state add column screen_mode text not null default 'default';
alter table event_state add column qa_host_user_id uuid references users(id) on delete set null;

alter table event_state add constraint event_state_screen_mode_valid
  check (screen_mode in ('default', 'qa', 'lottery'));

-- qa_host_user_id 只在 screen_mode='qa' 时有意义。其它模式下应为 null。
alter table event_state add constraint event_state_qa_host_consistency
  check (
    (screen_mode = 'qa' and qa_host_user_id is not null)
    or (screen_mode <> 'qa' and qa_host_user_id is null)
  );

-- 2. posts 加 'question' type + question_target_user_id
alter table posts drop constraint posts_type_check;
alter table posts add constraint posts_type_check
  check (type in ('text', 'poll', 'question'));

alter table posts add column question_target_user_id uuid
  references users(id) on delete set null;

-- question_target_user_id 只在 type='question' 时有意义。
alter table posts add constraint posts_question_target_consistency
  check (
    (type = 'question' and question_target_user_id is not null)
    or (type <> 'question' and question_target_user_id is null)
  );

create index posts_question_target_idx
  on posts (question_target_user_id, created_at desc)
  where question_target_user_id is not null;

-- 3. event_state 上 RLS + anon read，加进 publication
alter table event_state enable row level security;

create policy "anon read event_state"
  on event_state for select
  to anon
  using (true);

alter publication supabase_realtime add table event_state;
