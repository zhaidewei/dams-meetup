-- F'' AI 撮合 slice 3 — pg_cron 30min 触发 Edge Function。
-- 见 docs/matching-design.md §3 方案 F''。
--
-- 应用前置（人工，跑 migration 前必须先做）：
--
--   A. Supabase Dashboard → Database → Vault → New secret:
--        name:  service_role_key
--        value: <Project Settings → API → service_role>
--
--   B. (已替换好) Edge Function URL 用的是 project ref = eniydtuycfekkwirasto
--
-- 触发逻辑：
--   - cron 30min 自动触发 → Edge Function 内部判断 < 3 条新 intent 就 skip
--   - 强制触发：直接访问 https://<ref>.supabase.co/functions/v1/match?force=<ADMIN_TOKEN>
--     (ADMIN_TOKEN 由 supabase secrets set ADMIN_TOKEN=... 配置)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 幂等：先取消同名旧 job（首次跑时不存在会抛错，吞掉）
do $$
begin
  perform cron.unschedule('ai-matching-30min');
exception when others then null;
end $$;

select cron.schedule(
  'ai-matching-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://eniydtuycfekkwirasto.supabase.co/functions/v1/match',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  ) as request_id;
  $$
);

-- 查询 cron 状态：
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- 卸载：
--   select cron.unschedule('ai-matching-30min');
