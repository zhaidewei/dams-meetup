-- =====================================================================
-- 0020_post_like_count.sql — posts.like_count 计数列 + likes 触发器
-- =====================================================================
-- 动机：fetchFeed 原本对 likes 走 IN (post_ids) select 后 JS 聚合，likes
-- 行数 ~ O(posts × avg_likes/post)，活动中点赞频率高时这是主导成本。改为
-- 在 posts 表挂一个 like_count，写时 trigger 维护，读时 SSR 直接拿列值，
-- 干掉聚合查询。viewer-specific 的 liked_by_me 仍然要查 likes，但改成
-- user_id=viewerId AND post_id IN(post_ids)，行数从 O(posts × likes) 降到
-- ≤ O(posts)（每用户每帖最多 1 行）。
--
-- 不做 reply_count / vote_count 列，原因：
--   - replies 本来就要 join 全文（要渲染回复内容），数行没成本
--   - poll vote 还需要按 option_id group 算 option_counts，单计数列没用
--
-- 计数器一致性：trigger 在 likes 表 INSERT/DELETE row-level 触发，与写操作
-- 同事务，不会漂。如果某天怀疑漂了，直接重跑底部的 backfill UPDATE。

alter table posts
  add column if not exists like_count int not null default 0;

create or replace function bump_post_like_count() returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update posts set like_count = like_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    -- GREATEST 兜底防止历史脏数据让计数走负
    update posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists likes_count_trg on likes;
create trigger likes_count_trg
  after insert or delete on likes
  for each row execute function bump_post_like_count();

-- 一次性回填已有 likes 数据。幂等，重跑也安全。
update posts p
  set like_count = coalesce(
    (select count(*) from likes l where l.post_id = p.id),
    0
  );
