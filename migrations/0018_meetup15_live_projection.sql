ALTER TABLE activity_state ADD COLUMN projection_slide INTEGER NOT NULL DEFAULT 0
  CHECK (projection_slide >= 0);
ALTER TABLE activity_state ADD COLUMN agenda_start_override TEXT;
