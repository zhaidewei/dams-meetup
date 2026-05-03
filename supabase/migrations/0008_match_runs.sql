-- F'' AI 撮合 slice 3 — 日志表 + AI reply dedup 唯一约束。
-- 见 docs/matching-design.md §3 方案 F''、§6 实现 checklist。

-- 1. match_runs — 每次撮合一条记录，用于诊断 + 决定下一次是否跳过低 intent
create table match_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null
    check (status in ('running', 'success', 'skipped_low_intent', 'failed')),
  trigger text not null
    check (trigger in ('cron', 'admin')),
  posts_processed int not null default 0,
  replies_inserted int not null default 0,
  error text
);

create index match_runs_started_idx on match_runs (started_at desc);

-- 默认无 RLS policy = anon 读不到；service_role 不受 RLS 影响。
-- 这张表只用于运维，不暴露给客户端。
alter table match_runs enable row level security;

-- 2. dedup: 同一 (post_id, mentioned_user_id) 只允许一条 AI reply
-- 让 INSERT ON CONFLICT DO NOTHING 在重复推荐时静默跳过。
-- partial index 不影响普通 (is_ai=false) reply。
create unique index replies_ai_dedup_idx
  on replies (post_id, mentioned_user_id)
  where is_ai = true and mentioned_user_id is not null;
