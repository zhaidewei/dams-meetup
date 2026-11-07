CREATE TABLE activity_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  admission_open INTEGER NOT NULL DEFAULT 0 CHECK (admission_open IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

INSERT INTO activity_state (id) VALUES (1);
