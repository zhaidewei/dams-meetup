-- =====================================================================
-- 0018_lounge_section.sql — 增加 `lounge` 公共讨论区板块（issue #32）
-- =====================================================================
-- 不归属任何会议主题、无时间窗，永远开放；UI 上排第一位。
-- 需要把两个 CHECK 约束都加上 'lounge'：
--   posts.section          (0005)
--   event_state.current_section (0014)

alter table posts drop constraint if exists posts_section_check;
alter table posts
  add constraint posts_section_check
  check (section is null or section in ('lounge', 'p1', 'p2', 'breakout', 'panel'));

alter table event_state drop constraint if exists event_state_section_valid;
alter table event_state
  add constraint event_state_section_valid
  check (
    current_section is null
    or current_section in ('lounge', 'p1', 'p2', 'breakout', 'panel')
  );
