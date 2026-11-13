UPDATE activity_state
SET projection_mode = 'agenda', projection_round_id = NULL, projection_raffle_id = NULL,
    projection_slide = 0, projection_revision = projection_revision + 1
WHERE projection_mode = 'hidden';

DROP TRIGGER meetup15_projection_end_qa;

CREATE TRIGGER meetup15_projection_end_qa
AFTER UPDATE OF closed_at ON meetup15_qa_rounds
WHEN OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL
BEGIN
  UPDATE activity_state
  SET projection_mode = 'agenda', projection_round_id = NULL, projection_raffle_id = NULL,
      projection_slide = 0, projection_revision = projection_revision + 1
  WHERE id = 1;
END;
