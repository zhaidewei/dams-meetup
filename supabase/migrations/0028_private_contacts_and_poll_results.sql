-- 公开字段规则由数据库与服务端共同执行；身份是自建 Cookie，anon 没有可信 viewer ID。
begin;

create or replace view public.public_user_display as
select id, nickname, company,
       case when show_contact then contact_handle else null end as contact_handle,
       show_contact, is_vip, vip_name, vip_title
from public.users;

-- CREATE OR REPLACE 保留旧 ACL；自动可更新的 show_contact 不能留给浏览器写。
revoke all on table public.public_user_display from public, anon, authenticated;
grant select on table public.public_user_display to anon, authenticated;

-- 原始选票始终留在 service-role 边界内；截止/已投票等可见性由 fetchFeed 执行。
drop policy if exists "anon read poll_votes" on public.poll_votes;
revoke all on table public.poll_votes from public, anon, authenticated;

-- Realtime 的 DELETE 事件不能作为私密选票的授权层，直接移除原始表的广播。
do $$ begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poll_votes'
  ) then
    alter publication supabase_realtime drop table public.poll_votes;
  end if;
end $$;

-- 页面继续订阅公开 posts 的变更；只广播失效时间，不广播 voter/option。
alter table public.posts add column if not exists poll_updated_at timestamptz;
create or replace function public.notify_poll_vote_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.posts set poll_updated_at = clock_timestamp() where id = old.post_id;
  else
    update public.posts set poll_updated_at = clock_timestamp() where id = new.post_id;
    if tg_op = 'UPDATE' and old.post_id is distinct from new.post_id then
      update public.posts set poll_updated_at = clock_timestamp() where id = old.post_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.notify_poll_vote_change() from public, anon, authenticated;
drop trigger if exists poll_votes_notify_post on public.poll_votes;
create trigger poll_votes_notify_post after insert or update or delete on public.poll_votes
for each row execute function public.notify_poll_vote_change();

commit;
