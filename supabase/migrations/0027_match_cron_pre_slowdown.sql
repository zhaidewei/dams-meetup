-- AI 撮合 pre-event cron 降频：hourly @ :00 UTC → every 4 hours @ :00 UTC
--
-- 背景：活动当天前夜（2026-05-09 00:07 CEST）人工决策降频，给 pre 阶段省 DeepSeek 调用 +
-- 减少冷启动时段的无效 run（多数 pre run 因 < MIN_INTENT_THRESHOLD 直接 skip 也仍写一条 cron 记录）。
-- live (10min) 和 post (daily) 阶段不动。
--
-- 0025 的 ai-matching-pre 仍带 `where now() < event_start` 守卫，此处只换 schedule 表达式。

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('ai-matching-pre');
exception when others then null;
end $$;

select cron.schedule(
  'ai-matching-pre',
  '0 */4 * * *',
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

-- 验证：
--   select jobname, schedule, active from cron.job where jobname = 'ai-matching-pre';
--   预期 schedule = '0 */4 * * *'
