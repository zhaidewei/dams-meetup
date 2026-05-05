-- =====================================================================
-- 0019_qa_section.sql — QA 与板块绑定（issue #37）
-- =====================================================================
-- 目标：QA 模式启动时把当前 LIVE section 快照下来，让该轮 QA 的提问只
-- 在对应的 section 下出现在 /feed 顶部。否则切到 lounge 也能看到 QA
-- 提问入口和列表，会让人困惑。
--
-- 字段语义：
--   qa_section       — 当前 QA 绑定的板块；mode='qa' 时由 startQaAction 写入。
--                      null 表示该轮 QA 不绑定板块（活动外或空档期启动），
--                      此时退回旧行为（在所有 section 下都可见）。
--   last_qa_section  — 上一轮 QA 的板块；exitScreenModeAction 归档时写入，
--                      给 /feed 「上一轮 QA」塌陷区块用。
--
-- CHECK 约束与 current_section 保持一致（lounge / p1 / p2 / breakout / panel）。
--
-- 不动 publication：event_state 已在 supabase_realtime 里（migration 0015），
-- 新字段会自动随行 broadcast 给 anon。

alter table event_state add column qa_section text;
alter table event_state add column last_qa_section text;

alter table event_state add constraint event_state_qa_section_valid
  check (
    qa_section is null
    or qa_section in ('lounge', 'p1', 'p2', 'breakout', 'panel')
  );

alter table event_state add constraint event_state_last_qa_section_valid
  check (
    last_qa_section is null
    or last_qa_section in ('lounge', 'p1', 'p2', 'breakout', 'panel')
  );
