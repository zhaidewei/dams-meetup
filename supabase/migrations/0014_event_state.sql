-- =====================================================================
-- 0014_event_state.sql — 主办方控制板块状态（issue #19）
-- =====================================================================
-- 单行表：保存"当前板块"的手动覆写。getCurrentSection() 优先看这里，
-- 过期或为 null 时回落到议程时间表。
--
-- 不进 publication — 主办方控制台 /screen 通过服务端 polling 拉，
-- 普通客户端在每次 server-rendered fetch 时拉。频率低，不需要 Realtime。

create table event_state (
  id int primary key default 1,
  current_section text,         -- p1 / p2 / breakout / panel / null
  override_until timestamptz,   -- 覆写有效期；null 或过期则回落到时间表
  updated_at timestamptz not null default now(),
  constraint event_state_singleton check (id = 1),
  constraint event_state_section_valid check (
    current_section is null
    or current_section in ('p1', 'p2', 'breakout', 'panel')
  )
);

insert into event_state (id) values (1) on conflict (id) do nothing;
