CREATE TABLE meetup15_summary (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  metrics TEXT NOT NULL CHECK (json_valid(metrics)),
  published_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  cleaned_at INTEGER
);
