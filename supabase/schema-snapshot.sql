


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."bump_post_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (tg_op = 'INSERT') then
    update posts set like_count = like_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    -- GREATEST 兜底防止历史脏数据让计数走负
    update posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."bump_post_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_lottery_pool"("rules" "jsonb") RETURNS TABLE("user_id" "uuid", "weight" integer)
    LANGUAGE "sql" STABLE
    AS $$
  with cfg as (
    select
      coalesce((rules->>'must_have_posted')::bool, false)         as must_have_posted,
      coalesce((rules->>'exclude_previous_winners')::bool, true)  as exclude_prev,
      coalesce((rules->>'exclude_vips')::bool, true)              as exclude_vips,
      coalesce((rules->>'enable_weights')::bool, true)            as enable_weights,
      coalesce((rules->>'online_window_seconds')::int, 600)       as window_s
  ),
  online as (
    select u.id, u.is_vip
    from users u, cfg
    where u.last_seen_at >= now() - make_interval(secs => cfg.window_s)
      -- 排除系统账号（contact_handle 以 SYSTEM- 开头）
      and (u.contact_handle is null or u.contact_handle not like 'SYSTEM-%')
  ),
  participated as (
    select user_id from posts
    union
    select user_id from replies
    union
    select user_id from poll_votes
  ),
  prev_winners as (
    select winner_user_id as user_id
    from lottery_draws
    where winner_user_id is not null
  ),
  filtered as (
    select o.id
    from online o, cfg
    where (not cfg.exclude_vips or not o.is_vip)
      and (not cfg.must_have_posted or o.id in (select user_id from participated))
      and (not cfg.exclude_prev    or o.id not in (select user_id from prev_winners))
  ),
  posters as (
    select distinct user_id from posts where type = 'post'
  ),
  replied_targets as (
    select distinct p.user_id
    from posts p
    join replies r on r.post_id = p.id
  )
  select
    f.id as user_id,
    case when (select enable_weights from cfg)
      then 1
        + (case when f.id in (select user_id from posters)         then 1 else 0 end)
        + (case when f.id in (select user_id from replied_targets) then 1 else 0 end)
      else 1
    end as weight
  from filtered f;
$$;


ALTER FUNCTION "public"."compute_lottery_pool"("rules" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."compute_lottery_pool"("rules" "jsonb") IS '抽奖 v2 池子 + 权重一次算完。详见 docs/lottery-design-v2.md §3.3 和 §5。';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."dm_messages" (
    "id" bigint NOT NULL,
    "thread_id" bigint NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "revealed_contact" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dm_messages_body_check" CHECK (("char_length"("body") <= 300))
);


ALTER TABLE "public"."dm_messages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."dm_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."dm_messages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."dm_messages_id_seq" OWNED BY "public"."dm_messages"."id";



CREATE TABLE IF NOT EXISTS "public"."dm_notifications" (
    "id" bigint NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "thread_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dm_notifications" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."dm_notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."dm_notifications_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."dm_notifications_id_seq" OWNED BY "public"."dm_notifications"."id";



CREATE TABLE IF NOT EXISTS "public"."dm_threads" (
    "id" bigint NOT NULL,
    "user_low" "uuid" NOT NULL,
    "user_high" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dm_threads_check" CHECK (("user_low" < "user_high"))
);


ALTER TABLE "public"."dm_threads" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."dm_threads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."dm_threads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."dm_threads_id_seq" OWNED BY "public"."dm_threads"."id";



CREATE TABLE IF NOT EXISTS "public"."event_state" (
    "id" integer DEFAULT 1 NOT NULL,
    "current_section" "text",
    "override_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "screen_mode" "text" DEFAULT 'default'::"text" NOT NULL,
    "qa_host_user_id" "uuid",
    "lottery_draw_id" bigint,
    "last_qa_host_user_id" "uuid",
    "qa_section" "text",
    "last_qa_section" "text",
    "screen_filter_section" "text",
    "qa_started_at" timestamp with time zone,
    CONSTRAINT "event_state_last_qa_section_valid" CHECK ((("last_qa_section" IS NULL) OR ("last_qa_section" = ANY (ARRAY['lounge'::"text", 'p1'::"text", 'p2'::"text", 'breakout'::"text", 'panel'::"text"])))),
    CONSTRAINT "event_state_mode_consistency" CHECK (((("screen_mode" = 'qa'::"text") AND ("qa_host_user_id" IS NOT NULL) AND ("lottery_draw_id" IS NULL)) OR (("screen_mode" = 'lottery'::"text") AND ("qa_host_user_id" IS NULL) AND ("lottery_draw_id" IS NOT NULL)) OR (("screen_mode" = 'default'::"text") AND ("qa_host_user_id" IS NULL) AND ("lottery_draw_id" IS NULL)))),
    CONSTRAINT "event_state_qa_section_valid" CHECK ((("qa_section" IS NULL) OR ("qa_section" = ANY (ARRAY['lounge'::"text", 'p1'::"text", 'p2'::"text", 'breakout'::"text", 'panel'::"text"])))),
    CONSTRAINT "event_state_screen_filter_section_valid" CHECK ((("screen_filter_section" IS NULL) OR ("screen_filter_section" = ANY (ARRAY['lounge'::"text", 'p1'::"text", 'p2'::"text", 'breakout'::"text", 'panel'::"text"])))),
    CONSTRAINT "event_state_screen_mode_valid" CHECK (("screen_mode" = ANY (ARRAY['default'::"text", 'qa'::"text", 'lottery'::"text"]))),
    CONSTRAINT "event_state_section_valid" CHECK ((("current_section" IS NULL) OR ("current_section" = ANY (ARRAY['lounge'::"text", 'p1'::"text", 'p2'::"text", 'breakout'::"text", 'panel'::"text"])))),
    CONSTRAINT "event_state_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."event_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."likes" (
    "user_id" "uuid" NOT NULL,
    "post_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lottery_draws" (
    "id" bigint NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "pool_user_ids" "uuid"[] NOT NULL,
    "winner_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "pool_weights" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "random_seed" "bytea",
    CONSTRAINT "lottery_draws_close_consistency" CHECK (((("closed_at" IS NULL) AND ("winner_user_id" IS NULL)) OR (("closed_at" IS NOT NULL) AND ("winner_user_id" IS NOT NULL))))
);


ALTER TABLE "public"."lottery_draws" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lottery_draws_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lottery_draws_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lottery_draws_id_seq" OWNED BY "public"."lottery_draws"."id";



CREATE TABLE IF NOT EXISTS "public"."match_runs" (
    "id" bigint NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" NOT NULL,
    "trigger" "text" NOT NULL,
    "posts_processed" integer DEFAULT 0 NOT NULL,
    "replies_inserted" integer DEFAULT 0 NOT NULL,
    "error" "text",
    CONSTRAINT "match_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'skipped_low_intent'::"text", 'failed'::"text"]))),
    CONSTRAINT "match_runs_trigger_check" CHECK (("trigger" = ANY (ARRAY['cron'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."match_runs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."match_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."match_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."match_runs_id_seq" OWNED BY "public"."match_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."poll_votes" (
    "user_id" "uuid" NOT NULL,
    "post_id" bigint NOT NULL,
    "option_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_match_intents" (
    "post_id" bigint NOT NULL,
    "intent" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_match_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "body" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "show_contact" boolean DEFAULT false NOT NULL,
    "poll_options" "jsonb",
    "poll_multi" boolean,
    "poll_deadline" timestamp with time zone,
    "poll_hide_results" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "section" "text",
    "question_target_user_id" "uuid",
    "answered_at" timestamp with time zone,
    "like_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "posts_body_check" CHECK (("char_length"("body") <= 300)),
    CONSTRAINT "posts_question_target_consistency" CHECK (((("type" = 'question'::"text") AND ("question_target_user_id" IS NOT NULL)) OR (("type" <> 'question'::"text") AND ("question_target_user_id" IS NULL)))),
    CONSTRAINT "posts_section_check" CHECK ((("section" IS NULL) OR ("section" = ANY (ARRAY['lounge'::"text", 'p1'::"text", 'p2'::"text", 'breakout'::"text", 'panel'::"text"])))),
    CONSTRAINT "posts_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'poll'::"text", 'question'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."posts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."posts_id_seq" OWNED BY "public"."posts"."id";



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nickname" "text",
    "company" "text",
    "contact_handle" "text",
    "show_contact" boolean DEFAULT false NOT NULL,
    "recovery_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "is_vip" boolean DEFAULT false NOT NULL,
    "vip_name" "text",
    "vip_title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_me_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_consent_at" timestamp with time zone,
    "match_offer" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_user_display" AS
 SELECT "id",
    "nickname",
    "company",
    "contact_handle",
    "show_contact",
    "is_vip",
    "vip_name",
    "vip_title"
   FROM "public"."users";


ALTER VIEW "public"."public_user_display" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."replies" (
    "id" bigint NOT NULL,
    "post_id" bigint NOT NULL,
    "user_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_ai" boolean DEFAULT false NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "mentioned_user_id" "uuid",
    "updated_at" timestamp with time zone,
    "parent_reply_id" bigint,
    CONSTRAINT "replies_authored_check" CHECK ((("user_id" IS NOT NULL) OR ("is_ai" = true))),
    CONSTRAINT "replies_body_check" CHECK (("char_length"("body") <= 300)),
    CONSTRAINT "replies_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'author_only'::"text"])))
);


ALTER TABLE "public"."replies" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."replies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."replies_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."replies_id_seq" OWNED BY "public"."replies"."id";



CREATE TABLE IF NOT EXISTS "public"."vip_tokens" (
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "vip_name" "text" NOT NULL,
    "vip_title" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_at" timestamp with time zone,
    "username" "text",
    "password" "text"
);


ALTER TABLE "public"."vip_tokens" OWNER TO "postgres";


ALTER TABLE ONLY "public"."dm_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."dm_messages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."dm_notifications" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."dm_notifications_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."dm_threads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."dm_threads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lottery_draws" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lottery_draws_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."match_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."match_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."posts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."posts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."replies" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."replies_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_notifications"
    ADD CONSTRAINT "dm_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_threads"
    ADD CONSTRAINT "dm_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_threads"
    ADD CONSTRAINT "dm_threads_user_low_user_high_key" UNIQUE ("user_low", "user_high");



ALTER TABLE ONLY "public"."event_state"
    ADD CONSTRAINT "event_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_pkey" PRIMARY KEY ("user_id", "post_id");



ALTER TABLE ONLY "public"."lottery_draws"
    ADD CONSTRAINT "lottery_draws_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_runs"
    ADD CONSTRAINT "match_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("user_id", "post_id", "option_id");



ALTER TABLE ONLY "public"."post_match_intents"
    ADD CONSTRAINT "post_match_intents_pkey" PRIMARY KEY ("post_id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."replies"
    ADD CONSTRAINT "replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_recovery_token_key" UNIQUE ("recovery_token");



ALTER TABLE ONLY "public"."vip_tokens"
    ADD CONSTRAINT "vip_tokens_pkey" PRIMARY KEY ("token");



CREATE INDEX "dm_messages_thread_idx" ON "public"."dm_messages" USING "btree" ("thread_id", "created_at");



CREATE INDEX "dm_messages_unread_idx" ON "public"."dm_messages" USING "btree" ("thread_id", "sender_id") WHERE ("read_at" IS NULL);



CREATE INDEX "dm_notifications_recipient_idx" ON "public"."dm_notifications" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "dm_threads_user_high_idx" ON "public"."dm_threads" USING "btree" ("user_high");



CREATE INDEX "dm_threads_user_low_idx" ON "public"."dm_threads" USING "btree" ("user_low");



CREATE INDEX "likes_post_id_idx" ON "public"."likes" USING "btree" ("post_id");



CREATE INDEX "lottery_draws_created_at_idx" ON "public"."lottery_draws" USING "btree" ("created_at" DESC);



CREATE INDEX "lottery_draws_winner_idx" ON "public"."lottery_draws" USING "btree" ("winner_user_id");



CREATE INDEX "match_runs_started_idx" ON "public"."match_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "poll_votes_post_id_idx" ON "public"."poll_votes" USING "btree" ("post_id");



CREATE INDEX "post_match_intents_created_idx" ON "public"."post_match_intents" USING "btree" ("created_at" DESC);



CREATE INDEX "posts_created_at_idx" ON "public"."posts" USING "btree" ("created_at" DESC);



CREATE INDEX "posts_question_target_idx" ON "public"."posts" USING "btree" ("question_target_user_id", "created_at" DESC) WHERE ("question_target_user_id" IS NOT NULL);



CREATE INDEX "posts_section_created_idx" ON "public"."posts" USING "btree" ("section", "created_at" DESC) WHERE ("section" IS NOT NULL);



CREATE INDEX "posts_tags_gin" ON "public"."posts" USING "gin" ("tags");



CREATE INDEX "posts_unanswered_question_idx" ON "public"."posts" USING "btree" ("question_target_user_id", "created_at" DESC) WHERE (("type" = 'question'::"text") AND ("answered_at" IS NULL));



CREATE UNIQUE INDEX "replies_ai_dedup_idx" ON "public"."replies" USING "btree" ("post_id", "mentioned_user_id") WHERE (("is_ai" = true) AND ("mentioned_user_id" IS NOT NULL));



CREATE INDEX "replies_mentioned_idx" ON "public"."replies" USING "btree" ("mentioned_user_id") WHERE ("mentioned_user_id" IS NOT NULL);



CREATE INDEX "replies_parent_reply_id_idx" ON "public"."replies" USING "btree" ("parent_reply_id") WHERE ("parent_reply_id" IS NOT NULL);



CREATE INDEX "replies_post_ai_idx" ON "public"."replies" USING "btree" ("post_id", "is_ai");



CREATE INDEX "replies_post_id_idx" ON "public"."replies" USING "btree" ("post_id", "created_at");



CREATE UNIQUE INDEX "vip_tokens_username_idx" ON "public"."vip_tokens" USING "btree" ("username") WHERE ("username" IS NOT NULL);



CREATE OR REPLACE TRIGGER "likes_count_trg" AFTER INSERT OR DELETE ON "public"."likes" FOR EACH ROW EXECUTE FUNCTION "public"."bump_post_like_count"();



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."dm_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_notifications"
    ADD CONSTRAINT "dm_notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_notifications"
    ADD CONSTRAINT "dm_notifications_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."dm_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_threads"
    ADD CONSTRAINT "dm_threads_user_high_fkey" FOREIGN KEY ("user_high") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_threads"
    ADD CONSTRAINT "dm_threads_user_low_fkey" FOREIGN KEY ("user_low") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_state"
    ADD CONSTRAINT "event_state_last_qa_host_user_id_fkey" FOREIGN KEY ("last_qa_host_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_state"
    ADD CONSTRAINT "event_state_lottery_draw_id_fkey" FOREIGN KEY ("lottery_draw_id") REFERENCES "public"."lottery_draws"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_state"
    ADD CONSTRAINT "event_state_qa_host_user_id_fkey" FOREIGN KEY ("qa_host_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lottery_draws"
    ADD CONSTRAINT "lottery_draws_winner_user_id_fkey" FOREIGN KEY ("winner_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_match_intents"
    ADD CONSTRAINT "post_match_intents_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_question_target_user_id_fkey" FOREIGN KEY ("question_target_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."replies"
    ADD CONSTRAINT "replies_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."replies"
    ADD CONSTRAINT "replies_parent_reply_id_fkey" FOREIGN KEY ("parent_reply_id") REFERENCES "public"."replies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."replies"
    ADD CONSTRAINT "replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."replies"
    ADD CONSTRAINT "replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vip_tokens"
    ADD CONSTRAINT "vip_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



CREATE POLICY "anon read dm_notifications" ON "public"."dm_notifications" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon read event_state" ON "public"."event_state" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon read likes" ON "public"."likes" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon read poll_votes" ON "public"."poll_votes" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon read posts" ON "public"."posts" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon read public replies" ON "public"."replies" FOR SELECT TO "anon" USING (("visibility" = 'public'::"text"));



ALTER TABLE "public"."dm_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lottery_draws" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poll_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_match_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vip_tokens" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_post_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_post_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_post_like_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_lottery_pool"("rules" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_lottery_pool"("rules" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_lottery_pool"("rules" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_lottery_pool"("rules" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."dm_messages" TO "anon";
GRANT ALL ON TABLE "public"."dm_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."dm_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."dm_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."dm_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."dm_notifications" TO "anon";
GRANT ALL ON TABLE "public"."dm_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."dm_notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."dm_notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."dm_notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."dm_threads" TO "anon";
GRANT ALL ON TABLE "public"."dm_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_threads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."dm_threads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."dm_threads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."dm_threads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_state" TO "anon";
GRANT ALL ON TABLE "public"."event_state" TO "authenticated";
GRANT ALL ON TABLE "public"."event_state" TO "service_role";



GRANT ALL ON TABLE "public"."likes" TO "anon";
GRANT ALL ON TABLE "public"."likes" TO "authenticated";
GRANT ALL ON TABLE "public"."likes" TO "service_role";



GRANT ALL ON TABLE "public"."lottery_draws" TO "anon";
GRANT ALL ON TABLE "public"."lottery_draws" TO "authenticated";
GRANT ALL ON TABLE "public"."lottery_draws" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lottery_draws_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lottery_draws_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lottery_draws_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."match_runs" TO "anon";
GRANT ALL ON TABLE "public"."match_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."match_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."match_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."match_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."match_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."post_match_intents" TO "anon";
GRANT ALL ON TABLE "public"."post_match_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."post_match_intents" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."public_user_display" TO "anon";
GRANT ALL ON TABLE "public"."public_user_display" TO "authenticated";
GRANT ALL ON TABLE "public"."public_user_display" TO "service_role";



GRANT ALL ON TABLE "public"."replies" TO "anon";
GRANT ALL ON TABLE "public"."replies" TO "authenticated";
GRANT ALL ON TABLE "public"."replies" TO "service_role";



GRANT ALL ON SEQUENCE "public"."replies_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."replies_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."replies_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vip_tokens" TO "anon";
GRANT ALL ON TABLE "public"."vip_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."vip_tokens" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







