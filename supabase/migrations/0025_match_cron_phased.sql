-- AI 撮合 cron 拆三阶段（替换 0009 的单一 30min job）：
--   pre   (now < event_start):           hourly @ :00 UTC          → 给提前发暗需求帖兜底
--                                          （0027 降频为 every 4h @ :00 UTC）
--   live  (event_start ≤ now < event_end): every 10 min            → 高频跟现场节奏
--   post  (event_end ≤ now < cleanup):   daily @ 03:00 UTC × 7d    → 收尾兜底
--   cleanup (now ≥ event_end + 7d):      不触发                     → 论坛已过保留期
--
-- 活动时间硬编码（与 src/lib/constants.ts 对齐）：
--   start    = 2026-05-09T12:45:00+02:00 = 2026-05-09 10:45:00 UTC
--   end      = 2026-05-09T18:00:00+02:00 = 2026-05-09 16:00:00 UTC
--   cleanup  = end + 7d                   = 2026-05-16 16:00:00 UTC
--
-- 思路：三个独立 cron job，各自调度时间是粗粒度上限；每次触发时在 SQL 内
-- 用 now() 检查所属窗口，不在窗口就什么都不做。这样三个 job 永远只有一个
-- 在真正触发 Edge Function，无须互相 unschedule。
--
-- 应用前置：仍然依赖 vault.decrypted_secrets.service_role_key（migration 0009 已配）。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 卸载旧 30min job（如果首次跑不存在不抛错）
do $$
begin
  perform cron.unschedule('ai-matching-30min');
exception when others then null;
end $$;

-- 幂等：重新装载三阶段 jobs
do $$
declare j record;
begin
  for j in
    select jobname from cron.job
    where jobname in ('ai-matching-pre', 'ai-matching-live', 'ai-matching-post')
  loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- pre-event: hourly @ :00 UTC，仅在活动开始前触发
-- WHERE 子句不满足时 SELECT 产生 0 行 → net.http_post 不被求值，等价 no-op
select cron.schedule(
  'ai-matching-pre',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://eniydtuycfekkwirasto.supabase.co/functions/v1/match',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  )
  where now() < timestamptz '2026-05-09 10:45:00+00';
  $$
);

-- live: every 10 min UTC，仅在活动期间触发
select cron.schedule(
  'ai-matching-live',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://eniydtuycfekkwirasto.supabase.co/functions/v1/match',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  )
  where now() >= timestamptz '2026-05-09 10:45:00+00'
    and now() <  timestamptz '2026-05-09 16:00:00+00';
  $$
);

-- post-event: daily @ 03:00 UTC（≈ 05:00 CEST，避开活动时段）
-- 仅在 [event_end, event_end + 7d) 窗口内触发；7 天后停
select cron.schedule(
  'ai-matching-post',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://eniydtuycfekkwirasto.supabase.co/functions/v1/match',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  )
  where now() >= timestamptz '2026-05-09 16:00:00+00'
    and now() <  timestamptz '2026-05-16 16:00:00+00';
  $$
);

-- 查询 cron 状态：
--   select jobname, schedule, active from cron.job order by jobname;
--   select * from cron.job_run_details order by start_time desc limit 20;
--
-- 卸载（手工逐个）：
--   select cron.unschedule('ai-matching-pre');
--   select cron.unschedule('ai-matching-live');
--   select cron.unschedule('ai-matching-post');
--
-- 强制触发（绕开 cron + 窗口检查，仍走 Edge Function 内部 force=ADMIN_TOKEN 校验）：
--   curl 'https://eniydtuycfekkwirasto.supabase.co/functions/v1/match?force=<ADMIN_TOKEN>'
