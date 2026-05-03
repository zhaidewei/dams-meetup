-- =====================================================================
-- 0012_dm.sql — 站内信 (issue #6, scope C)
-- =====================================================================
-- 1-on-1 DM 线程 + 消息 + Realtime 通知 fan-out。
--
-- 安全设计（关键）：项目刻意不用 Supabase Auth，客户端只持 anon key，
-- 因此 Realtime 无法基于 RLS 做"按用户过滤"。否则两条路都不通：
--   - 把 dm_messages 进 publication + anon read → 任何人能拉所有 DM
--   - 不进 publication / RLS deny → 接收方收不到 Realtime 事件
--
-- 采用 fan-out：dm_messages 物理私密（不进 publication，RLS deny anon），
-- 单独的 dm_notifications 表只携 (recipient_id, thread_id) 元数据，进
-- publication，anon 可读。客户端订阅自己的 recipient_id，收到事件后用
-- 服务端 action 走 cookie 鉴权再拉真正消息体。
--
-- 残余暴露：anon attacker 若全表订阅 dm_notifications 能看到"用户 X 在
-- 时刻 T 在 thread Z 收到一条 DM"——拿不到内容、发送方、对方身份。可
-- 接受（与 F'' 方案 anon 能见 post_id 但不能见 match_intent 同等级）。

-- 1. threads
create table dm_threads (
  id bigserial primary key,
  user_low  uuid not null references users(id) on delete cascade,
  user_high uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_low, user_high),
  check (user_low < user_high)
);

create index dm_threads_user_low_idx  on dm_threads (user_low);
create index dm_threads_user_high_idx on dm_threads (user_high);

-- 2. messages
create table dm_messages (
  id bigserial primary key,
  thread_id bigint not null references dm_threads(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) <= 300),
  revealed_contact text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index dm_messages_thread_idx on dm_messages (thread_id, created_at);
create index dm_messages_unread_idx on dm_messages (thread_id, sender_id) where read_at is null;

-- 3. fan-out for realtime
create table dm_notifications (
  id bigserial primary key,
  recipient_id uuid not null references users(id) on delete cascade,
  thread_id bigint not null references dm_threads(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index dm_notifications_recipient_idx on dm_notifications (recipient_id, created_at desc);

-- 4. RLS
alter table dm_threads        enable row level security;
alter table dm_messages       enable row level security;
alter table dm_notifications  enable row level security;

-- threads / messages：不写任何 anon policy = 默认全拒。service_role 不受 RLS。
-- notifications：anon 可读（只含 recipient_id + thread_id 元数据）
create policy "anon read dm_notifications" on dm_notifications
  for select to anon using (true);

-- 5. 仅 notifications 进 publication
alter publication supabase_realtime add table dm_notifications;

-- 部署后必须 Dashboard → Database → Replication 把 dm_notifications toggle 一下，
-- 否则 ALTER PUBLICATION 不会触发 Realtime 重载（PR #7 验证过的坑）。
