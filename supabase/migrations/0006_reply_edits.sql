-- =====================================================================
-- 0006_reply_edits.sql — let users edit / delete their own replies
-- =====================================================================
-- updated_at is NULL until the first edit. The UI shows "已编辑" iff
-- updated_at is not null. Server actions (updateReplyAction) explicitly
-- set updated_at = now() on edit; no trigger.

alter table replies add column updated_at timestamptz;
