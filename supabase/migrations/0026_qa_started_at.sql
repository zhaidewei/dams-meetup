-- =====================================================================
-- 0026_qa_started_at.sql — QA 环节开始时间戳
-- =====================================================================
-- 目标：让大屏在 QA 进行时显示「已进行 mm:ss」，给嘉宾和主办方一个直观
-- 的进度感（一般 QA 控制在 8-12 分钟）。
--
-- 选择字段位置：写在 event_state 而不是新表 —— qa session 永远只有一个
-- (event_state.id=1)，跟 qa_host_user_id / qa_section 同列管理最简单。
-- exitScreenModeAction 清除时一同 set null，不归档（开始时间没复用价值，
-- 中奖记录那种历史归档需求 QA 没有）。
--
-- 不动 publication：event_state 已在 supabase_realtime 里。新字段随行
-- broadcast，/screen tab 收到 event_state UPDATE 自然触发 refresh。

alter table event_state add column qa_started_at timestamptz;
