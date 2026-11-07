ALTER TABLE activity_state ADD COLUMN section_override TEXT;

CREATE TABLE meetup15_qa_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id TEXT NOT NULL REFERENCES meetup15_members(id),
  section TEXT NOT NULL,
  opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
  closed_at INTEGER
);

CREATE UNIQUE INDEX meetup15_qa_one_open ON meetup15_qa_rounds((1)) WHERE closed_at IS NULL;

CREATE TRIGGER meetup15_qa_close_previous
BEFORE INSERT ON meetup15_qa_rounds WHEN NEW.closed_at IS NULL
BEGIN
  UPDATE meetup15_qa_rounds SET closed_at = NEW.opened_at WHERE closed_at IS NULL;
END;

CREATE TABLE meetup15_discussion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('post', 'reply', 'question')),
  author_id TEXT NOT NULL REFERENCES meetup15_members(id),
  section TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 300),
  tags TEXT NOT NULL DEFAULT '[]',
  post_id INTEGER REFERENCES meetup15_discussion(id) ON DELETE CASCADE,
  parent_reply_id INTEGER REFERENCES meetup15_discussion(id) ON DELETE CASCADE,
  round_id INTEGER REFERENCES meetup15_qa_rounds(id) ON DELETE CASCADE,
  answered INTEGER NOT NULL DEFAULT 0 CHECK (answered IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (kind = 'post' AND post_id IS NULL AND parent_reply_id IS NULL AND round_id IS NULL)
    OR (kind = 'reply' AND post_id IS NOT NULL AND round_id IS NULL)
    OR (kind = 'question' AND post_id IS NULL AND parent_reply_id IS NULL AND round_id IS NOT NULL)
  )
);

CREATE INDEX meetup15_discussion_feed ON meetup15_discussion(section, id DESC) WHERE kind = 'post';
CREATE INDEX meetup15_discussion_post ON meetup15_discussion(post_id, id);
CREATE INDEX meetup15_discussion_parent ON meetup15_discussion(parent_reply_id);
CREATE INDEX meetup15_discussion_round ON meetup15_discussion(round_id, id);

CREATE TABLE meetup15_discussion_likes (
  item_id INTEGER NOT NULL REFERENCES meetup15_discussion(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES meetup15_members(id),
  PRIMARY KEY (item_id, member_id)
);
