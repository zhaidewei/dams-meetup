ALTER TABLE meetup15_qa_rounds ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER meetup15_projection_reopen_qa
AFTER UPDATE OF closed_at ON meetup15_qa_rounds
WHEN OLD.closed_at IS NOT NULL AND NEW.closed_at IS NULL
BEGIN
  UPDATE activity_state
  SET projection_mode = 'qa', projection_round_id = NEW.id, projection_revision = projection_revision + 1
  WHERE id = 1;
END;
