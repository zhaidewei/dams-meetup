-- F'' AI 撮合方案：composer 暗字段 + AI 内联回帖
-- 见 docs/matching-design.md §3 方案 F''、§6 实现 checklist

-- 1. posts.match_intent — 私下撮合需求，仅 author + LLM 可见
alter table posts add column match_intent text;

-- 2. replies 扩展为 AI inline reply 容器
alter table replies
  alter column user_id drop not null,
  add column is_ai boolean not null default false,
  add column visibility text not null default 'public'
    check (visibility in ('public', 'author_only')),
  add column mentioned_user_id uuid references users(id) on delete set null;

-- 不变量：每条 reply 要么有人类作者，要么是 AI
alter table replies
  add constraint replies_authored_check
  check ((user_id is not null) or (is_ai = true));

create index if not exists replies_mentioned_idx
  on replies (mentioned_user_id) where mentioned_user_id is not null;
create index if not exists replies_post_ai_idx
  on replies (post_id, is_ai);

-- 3. 收紧 anon read：author_only 回复绝不通过 anon SELECT / Realtime 泄漏
-- 服务端 (service_role) 仍能读全部，由应用层基于 viewer 身份过滤
drop policy if exists "anon read replies" on replies;
create policy "anon read public replies" on replies
  for select to anon
  using (visibility = 'public');

-- 4. 删除 matches 表 — F'' 把撮合结果存到 replies 里
drop table if exists matches;

-- TODO when wiring Realtime: 确保 anon 客户端不会通过 broadcast 收到
-- posts.match_intent（用 redacted view 或 column-level grant）
