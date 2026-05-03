-- =====================================================================
-- 0007_reply_threads.sql — one-level nested replies
-- =====================================================================
-- parent_reply_id = NULL  → top-level reply
-- parent_reply_id != NULL → child of that reply
--
-- We allow only one nesting level: createReplyAction flattens any reply
-- whose parent itself has a parent (i.e. replying to a child of the
-- top-level) up to the top-level. Schema does NOT enforce this — the
-- check sits in the server action so we can change UX later without
-- migrating data.
--
-- ON DELETE CASCADE: if a top-level reply is deleted, its children go
-- with it. Acceptable for an event-scoped app — keeping orphaned
-- "@张三 ..." replies pointing at nothing is more confusing.

alter table replies
  add column parent_reply_id bigint references replies(id) on delete cascade;

create index replies_parent_reply_id_idx
  on replies (parent_reply_id)
  where parent_reply_id is not null;
