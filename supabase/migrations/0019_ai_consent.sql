-- =====================================================================
-- 0019_ai_consent.sql — 用户对「把内容发给 DeepSeek 撮合」的显式同意（issue #34）
-- =====================================================================
-- 单列即可覆盖两路数据：
--   1) 自己的私下需求（post_match_intents.intent）
--   2) 自己的公开发帖被聚合成画像，供 AI 给别人推荐
-- 因为用户委托 AI 找人 = 必然也得贡献画像供反向匹配，两件事不可分割。
--
-- 语义：
--   null         → 从未决定。UI 在用户首次点「委托 AI 撮合」时弹询问。
--   not null     → 已同意，永不再问；时间戳供审计。
--   拒绝         → 不写库（example 行为：下次再问）。
--
-- 后端两路守卫均依赖此列：
--   - createPostAction：写 post_match_intents 前 double-check。
--   - supabase/functions/match：fetchProfiles 过滤未同意者；
--     fetchCandidates 因 intent 写入已被 gate，无需重复过滤。

alter table users
  add column if not exists ai_consent_at timestamptz;
