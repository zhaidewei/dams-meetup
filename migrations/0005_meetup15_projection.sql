ALTER TABLE activity_state ADD COLUMN projection_mode TEXT NOT NULL DEFAULT 'hidden'
  CHECK (projection_mode IN ('hidden', 'agenda', 'qa', 'raffle'));
ALTER TABLE activity_state ADD COLUMN projection_round_id INTEGER
  REFERENCES meetup15_qa_rounds(id) ON DELETE SET NULL;
ALTER TABLE activity_state ADD COLUMN projection_revision INTEGER NOT NULL DEFAULT 0;

UPDATE activity_state
SET projection_mode = 'qa',
  projection_round_id = (SELECT id FROM meetup15_qa_rounds WHERE closed_at IS NULL)
WHERE id = 1 AND EXISTS (SELECT 1 FROM meetup15_qa_rounds WHERE closed_at IS NULL);

CREATE TRIGGER meetup15_projection_open_qa
AFTER INSERT ON meetup15_qa_rounds WHEN NEW.closed_at IS NULL
BEGIN
  UPDATE activity_state
  SET projection_mode = 'qa', projection_round_id = NEW.id, projection_revision = projection_revision + 1
  WHERE id = 1;
END;

CREATE TRIGGER meetup15_projection_end_qa
AFTER UPDATE OF closed_at ON meetup15_qa_rounds
WHEN OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL
BEGIN
  UPDATE activity_state
  SET projection_mode = 'hidden', projection_round_id = NULL, projection_revision = projection_revision + 1
  WHERE id = 1;
END;
