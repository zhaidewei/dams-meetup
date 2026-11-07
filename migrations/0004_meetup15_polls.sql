CREATE TABLE meetup15_polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL REFERENCES meetup15_members(id),
  section TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  options TEXT NOT NULL CHECK (json_array_length(options) BETWEEN 2 AND 6),
  multiple INTEGER NOT NULL CHECK (multiple IN (0, 1)),
  hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
  deadline INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX meetup15_polls_section ON meetup15_polls(section, id DESC);

CREATE TABLE meetup15_ballots (
  poll_id INTEGER NOT NULL REFERENCES meetup15_polls(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES meetup15_members(id),
  choices TEXT NOT NULL,
  PRIMARY KEY (poll_id, member_id)
);

ALTER TABLE activity_state ADD COLUMN screen_mode TEXT NOT NULL DEFAULT 'live' CHECK (screen_mode IN ('intro', 'live'));
ALTER TABLE activity_state ADD COLUMN screen_poll_section TEXT;
ALTER TABLE activity_state ADD COLUMN reveal_poll_id INTEGER REFERENCES meetup15_polls(id) ON DELETE SET NULL;
ALTER TABLE activity_state ADD COLUMN screen_lottery TEXT;
ALTER TABLE meetup15_members ADD COLUMN last_seen_at INTEGER;
CREATE INDEX meetup15_members_last_seen ON meetup15_members(last_seen_at);

CREATE TRIGGER meetup15_screen_on_qa_start
AFTER INSERT ON meetup15_qa_rounds WHEN NEW.closed_at IS NULL
BEGIN
  UPDATE activity_state SET screen_mode = 'live' WHERE id = 1;
END;
