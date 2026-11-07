CREATE TABLE meetup15_members (
  id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('attendee', 'guest')),
  display_name TEXT,
  title TEXT,
  username TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (role = 'attendee' AND username IS NULL AND password_hash IS NULL)
    OR (role = 'guest' AND username IS NOT NULL AND password_hash IS NOT NULL AND display_name IS NOT NULL)
  )
);
