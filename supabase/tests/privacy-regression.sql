-- 仅用于从 schema 快照 + 0028 重建的空白隔离数据库，不连接生产。
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'dams_privacy_test' or exists (select 1 from public.users) then
    raise exception 'Requires empty isolated dams_privacy_test database';
  end if;
end $$;

insert into public.users (id, nickname, contact_handle, show_contact) values
 ('11111111-1111-4111-8111-111111111111', 'Private fixture', 'private@example.invalid', false),
 ('22222222-2222-4222-8222-222222222222', 'Public fixture', 'public@example.invalid', true);
insert into public.posts (id, user_id, type, body, poll_options, poll_multi, poll_deadline, poll_hide_results)
values (1, '11111111-1111-4111-8111-111111111111', 'poll', 'Dummy poll', '[{"id":1,"label":"A"},{"id":2,"label":"B"}]', false, now() + interval '1 day', true);

set local role service_role;
insert into public.poll_votes (user_id, post_id, option_id)
values ('11111111-1111-4111-8111-111111111111', 1, 1);
do $$ begin
  if not exists (select 1 from public.users where contact_handle='private@example.invalid')
     or (select count(*) from public.poll_votes where post_id=1) <> 1 then
    raise exception 'Service role lost private data access';
  end if;
end $$;
reset role;

set local role anon;
do $$ begin
  if (select count(*) from public.public_user_display) <> 2
     or exists (select 1 from public.public_user_display where not show_contact and contact_handle is not null)
     or not exists (select 1 from public.public_user_display where show_contact and contact_handle='public@example.invalid') then
    raise exception 'Public contact visibility violated';
  end if;
  begin
    perform option_id from public.poll_votes where post_id=1;
    raise exception 'Anon can read raw ballots';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.public_user_display set show_contact=true where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Anon can change privacy through the public view';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.public_user_display where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Anon can delete through the public view';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.public_user_display (id, nickname) values ('33333333-3333-4333-8333-333333333333', 'Denied');
    raise exception 'Anon can insert through the public view';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
do $$ begin
  if exists (select 1 from public.public_user_display where not show_contact and contact_handle is not null) then
    raise exception 'Authenticated role can read private contact';
  end if;
  begin
    perform option_id from public.poll_votes where post_id=1;
    raise exception 'Authenticated role can read raw ballots';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.public_user_display set show_contact=true where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Authenticated role can change privacy through the public view';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.public_user_display where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Authenticated role can delete through the public view';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.public_user_display (id, nickname) values ('33333333-3333-4333-8333-333333333333', 'Denied');
    raise exception 'Authenticated role can insert through the public view';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  if (select show_contact from public.users where id='11111111-1111-4111-8111-111111111111') then
    raise exception 'Private setting was changed';
  end if;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='poll_votes')
     or not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='posts')
     or (select poll_updated_at from public.posts where id=1) is null then
    raise exception 'Safe insert notification or publication boundary missing';
  end if;
end $$;

update public.posts set poll_updated_at=null where id=1;
set local role service_role;
delete from public.poll_votes where post_id=1;
reset role;
do $$ begin
  if (select poll_updated_at from public.posts where id=1) is null then
    raise exception 'Safe delete notification missing';
  end if;
end $$;

select 'FIXED private_contact_redacted=true public_contact_preserved=true view_writes_denied=true ballots_denied=true service_role_preserved=true safe_refresh=true';
rollback;
