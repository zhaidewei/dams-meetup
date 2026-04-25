-- VIP login: switch from URL-token claim to username+password.
-- Organizer pre-inserts (username, password, vip_name, vip_title) rows.
-- VIPs visit /vip-login, enter their credentials → users row is upgraded
-- (is_vip=true, vip_name, vip_title) and the vip_tokens row is linked.

alter table vip_tokens add column if not exists username text;
alter table vip_tokens add column if not exists password text;

-- Auto-generate token so admin inserts only need (username, password, vip_name, vip_title).
alter table vip_tokens alter column token set default encode(gen_random_bytes(16), 'hex');

-- username is the VIP-facing login id, must be unique among rows that have one.
create unique index if not exists vip_tokens_username_idx on vip_tokens (username) where username is not null;
