ALTER TABLE meetup15_members ADD COLUMN contact TEXT;
ALTER TABLE meetup15_members ADD COLUMN contact_public INTEGER NOT NULL DEFAULT 0 CHECK (contact_public IN (0, 1));
ALTER TABLE meetup15_members ADD COLUMN profile_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetup15_members ADD COLUMN replies_seen_through INTEGER NOT NULL DEFAULT 0;
CREATE INDEX meetup15_discussion_author ON meetup15_discussion(author_id, kind, id);

CREATE TABLE meetup15_dm_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_a TEXT NOT NULL REFERENCES meetup15_members(id) ON DELETE CASCADE,
  member_b TEXT REFERENCES meetup15_members(id) ON DELETE CASCADE,
  CHECK (member_b IS NULL OR member_a < member_b),
  UNIQUE (member_a, member_b)
);
CREATE UNIQUE INDEX meetup15_dm_system_thread ON meetup15_dm_threads(member_a) WHERE member_b IS NULL;
CREATE INDEX meetup15_dm_member_b ON meetup15_dm_threads(member_b);

CREATE TABLE meetup15_dm_views (
  thread_id INTEGER NOT NULL REFERENCES meetup15_dm_threads(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES meetup15_members(id) ON DELETE CASCADE,
  hidden_through INTEGER NOT NULL DEFAULT 0,
  read_through INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thread_id, member_id)
);

CREATE TABLE meetup15_raffles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidates TEXT NOT NULL CHECK (json_valid(candidates)),
  ready_at INTEGER NOT NULL,
  finished_at INTEGER,
  winner_id TEXT REFERENCES meetup15_members(id) ON DELETE SET NULL,
  winner_name TEXT
);
CREATE UNIQUE INDEX meetup15_raffle_one_pending ON meetup15_raffles((1)) WHERE finished_at IS NULL;
CREATE INDEX meetup15_raffle_winner ON meetup15_raffles(winner_id) WHERE winner_id IS NOT NULL;

CREATE TABLE meetup15_dm_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES meetup15_dm_threads(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES meetup15_members(id) ON DELETE CASCADE,
  raffle_id INTEGER UNIQUE REFERENCES meetup15_raffles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 300),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((sender_id IS NULL) = (raffle_id IS NOT NULL))
);
CREATE INDEX meetup15_dm_message_thread ON meetup15_dm_messages(thread_id, id);
