ALTER TABLE activity_state ADD COLUMN question_revision INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER meetup15_question_inserted AFTER INSERT ON meetup15_discussion
WHEN NEW.kind = 'question'
BEGIN
  UPDATE activity_state SET question_revision = question_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_question_updated AFTER UPDATE ON meetup15_discussion
WHEN OLD.kind = 'question' OR NEW.kind = 'question'
BEGIN
  UPDATE activity_state SET question_revision = question_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_question_deleted AFTER DELETE ON meetup15_discussion
WHEN OLD.kind = 'question'
BEGIN
  UPDATE activity_state SET question_revision = question_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_question_like_inserted AFTER INSERT ON meetup15_discussion_likes
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id = NEW.item_id AND kind = 'question')
BEGIN
  UPDATE activity_state SET question_revision = question_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_question_like_deleted AFTER DELETE ON meetup15_discussion_likes
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id = OLD.item_id AND kind = 'question')
BEGIN
  UPDATE activity_state SET question_revision = question_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_question_author_renamed AFTER UPDATE OF display_name ON meetup15_members
WHEN OLD.display_name IS NOT NEW.display_name AND EXISTS (
  SELECT 1 FROM meetup15_discussion WHERE author_id = NEW.id AND kind = 'question'
)
BEGIN
  UPDATE activity_state SET question_revision = question_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_question_like_updated AFTER UPDATE ON meetup15_discussion_likes
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id IN (OLD.item_id, NEW.item_id) AND kind = 'question')
BEGIN
  UPDATE activity_state SET question_revision = question_revision + 1 WHERE id = 1;
END;
