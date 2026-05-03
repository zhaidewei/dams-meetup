-- F'' AI 撮合 slice 2 — 手工 mock 一条 AI reply，验证 UI 渲染链路。
--
-- 跑法：
--   1. Supabase SQL Editor 全选粘贴执行
--   2. NOTICE 输出 post_id / author_uid / mentioned_uid
--   3. dev：用 author_uid 的浏览器打开 /feed → 该 post 下方应出现蓝色 "AI 撮合 · 仅你可见" 卡
--   4. dev：用 mentioned_uid 的浏览器打开 /me → "有人想找你" section 应有一条
--   5. 第三方浏览器（既不是 author 也不是 mentioned）打开 /feed → 看不到这条 AI reply
--   6. 清理：脚本会在每次执行开头自动删除带 [slice2 mock] 标记的旧记录
--
-- 前置：posts 表至少 1 条带 author 的记录；users 表至少 2 个用户

begin;

-- 1. 清掉前一次的 mock（idempotent，反复跑不会堆积）
delete from replies where is_ai = true and body like '%[slice2 mock]%';

-- 2. 选最近一条有 author 的 post + 一个不同的 user，插入 mock AI reply
do $$
declare
  v_post_id bigint;
  v_author_uid uuid;
  v_author_token text;
  v_mentioned_uid uuid;
  v_mentioned_token text;
  v_reply_id bigint;
begin
  select p.id, p.user_id, u.recovery_token
    into v_post_id, v_author_uid, v_author_token
  from posts p
  join users u on u.id = p.user_id
  where p.user_id is not null
  order by p.created_at desc
  limit 1;

  if v_post_id is null then
    raise exception '需要先在 dev /feed 发一条帖子作为载体';
  end if;

  select id, recovery_token into v_mentioned_uid, v_mentioned_token
  from users
  where id <> v_author_uid
  order by created_at desc nulls last
  limit 1;

  if v_mentioned_uid is null then
    raise exception 'users 表只有 1 个用户 — 用 incognito 浏览器先访问一次 /feed 创建第二个 user';
  end if;

  insert into replies (post_id, user_id, is_ai, visibility, body, mentioned_user_id)
  values (
    v_post_id,
    null,
    true,
    'author_only',
    '[slice2 mock] 推荐你和这位用户聊聊 — 你私下提到的需求与对方画像匹配。',
    v_mentioned_uid
  )
  returning id into v_reply_id;

  raise notice '✅ mock AI reply created (reply_id=%, post_id=%)', v_reply_id, v_post_id;
  raise notice ' ';
  raise notice '验证（dev host = http://localhost:3000）：';
  raise notice '  作者视角 → /feed 应见蓝色 AI 撮合卡：';
  raise notice '    http://localhost:3000/recover?u=%&t=%', v_author_uid, v_author_token;
  raise notice '  被提及视角 → /me "有人想找你" 应有一条：';
  raise notice '    http://localhost:3000/recover?u=%&t=%', v_mentioned_uid, v_mentioned_token;
end $$;

commit;
