ALTER TABLE activity_state ADD COLUMN post_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activity_state ADD COLUMN round_revision INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER meetup15_feed_post_inserted AFTER INSERT ON meetup15_discussion
WHEN NEW.kind IN ('post', 'reply')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_post_updated AFTER UPDATE ON meetup15_discussion
WHEN OLD.kind IN ('post', 'reply') OR NEW.kind IN ('post', 'reply')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_post_deleted AFTER DELETE ON meetup15_discussion
WHEN OLD.kind IN ('post', 'reply')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_post_like_inserted AFTER INSERT ON meetup15_discussion_likes
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id = NEW.item_id AND kind = 'post')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_post_like_deleted AFTER DELETE ON meetup15_discussion_likes
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id = OLD.item_id AND kind = 'post')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_post_like_updated AFTER UPDATE ON meetup15_discussion_likes
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id IN (OLD.item_id, NEW.item_id) AND kind = 'post')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_reaction_inserted AFTER INSERT ON meetup15_reply_reactions
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id = NEW.reply_id AND kind = 'post')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_reaction_deleted AFTER DELETE ON meetup15_reply_reactions
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id = OLD.reply_id AND kind = 'post')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_reaction_updated AFTER UPDATE ON meetup15_reply_reactions
WHEN EXISTS (SELECT 1 FROM meetup15_discussion WHERE id IN (OLD.reply_id, NEW.reply_id) AND kind = 'post')
BEGIN
  UPDATE activity_state SET post_revision = post_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_author_renamed AFTER UPDATE OF display_name ON meetup15_members
WHEN OLD.display_name IS NOT NEW.display_name
BEGIN
  UPDATE activity_state SET
    post_revision = post_revision + EXISTS (
      SELECT 1 FROM meetup15_discussion WHERE author_id = NEW.id AND kind = 'post'
    ),
    round_revision = round_revision + CASE WHEN NEW.role = 'guest' THEN 1 ELSE 0 END
  WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_round_inserted AFTER INSERT ON meetup15_qa_rounds
BEGIN
  UPDATE activity_state SET round_revision = round_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_round_updated AFTER UPDATE ON meetup15_qa_rounds
BEGIN
  UPDATE activity_state SET round_revision = round_revision + 1 WHERE id = 1;
END;

CREATE TRIGGER meetup15_feed_round_deleted AFTER DELETE ON meetup15_qa_rounds
BEGIN
  UPDATE activity_state SET round_revision = round_revision + 1 WHERE id = 1;
END;
