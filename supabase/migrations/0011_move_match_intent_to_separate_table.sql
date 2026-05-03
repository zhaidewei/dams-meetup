-- =====================================================================
-- 0011_move_match_intent_to_separate_table.sql
-- =====================================================================
-- 撤销 0010 的 publication 列白名单方案。实测发现 Supabase Realtime 不广播
-- 列白名单 publication 的变更（subscribe 成功但 INSERT 后 anon 收不到任何
-- broadcast），不能 ship。
--
-- 改用物理隔离：把 match_intent 整列搬到独立表 post_match_intents，新表
-- 不进 publication。posts 整表广播照旧（行为可预期），不依赖 Realtime
-- 任何内部解析行为，安全边界由 schema 强制。
--
-- 维护提醒：以后如果还有 "anon 不能见到的字段"，统一进 post_match_intents
-- 或新建 post_xxx 私密表，不要再加进 posts。

-- 1. 把 posts 重新作为整表加进 publication（撤销 0010 的列白名单）
alter publication supabase_realtime drop table posts;
alter publication supabase_realtime add table posts;

-- 2. 创建 post_match_intents
create table post_match_intents (
  post_id bigint primary key references posts(id) on delete cascade,
  intent text not null,
  created_at timestamptz not null default now()
);

create index post_match_intents_created_idx on post_match_intents (created_at desc);

-- 3. 迁移现有数据
insert into post_match_intents (post_id, intent)
  select id, match_intent
  from posts
  where match_intent is not null;

-- 4. 删除 posts.match_intent
alter table posts drop column match_intent;

-- 5. RLS：开启但不写 anon policy = anon 完全读不到。service_role 不受 RLS。
alter table post_match_intents enable row level security;
