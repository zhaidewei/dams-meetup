-- =====================================================================
-- 0024_screen_filter_section.sql — 大屏视图筛选升级为 server state
-- =====================================================================
-- 目标（issue #45）：把 ScreenAdminBar 从 /screen 拆到独立 /admin（手机
-- 操作友好）。原来 filter 是 URL state（/screen?section=X，per-tab），手
-- 机改 URL 影响不到大屏 tab，搬到 /admin 后必须走 server state 才有意义。
--
-- 字段语义：
--   screen_filter_section — /screen 当前**筛选**显示的板块（仅大屏视图，不影响
--                            /feed、不影响 LIVE 红标）；null = 全部。
--                            跟 current_section 不同，current_section 是事实
--                            「现在在演讲哪个 section」的状态，filter 只是大屏
--                            想"放大"看哪一段历史 / 实时帖。
--
-- CHECK 约束与 current_section / qa_section / last_qa_section 一致
-- （lounge / p1 / p2 / breakout / panel），未来加 section 时和它们一起 alter。
--
-- 不动 publication：event_state 已在 supabase_realtime（migration 0015），新字段
-- 会自动随行 broadcast，/screen 的 ScreenView 已订阅 mode 变化 → filter 变化
-- 也走同一条 Realtime 通路。

alter table event_state add column screen_filter_section text;

alter table event_state add constraint event_state_screen_filter_section_valid
  check (
    screen_filter_section is null
    or screen_filter_section in ('lounge', 'p1', 'p2', 'breakout', 'panel')
  );
