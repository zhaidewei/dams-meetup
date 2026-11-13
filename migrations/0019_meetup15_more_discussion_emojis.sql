CREATE TABLE meetup15_discussion_reactions (
  reply_id INTEGER NOT NULL REFERENCES meetup15_discussion(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN (
    '👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '👏', '🔥',
    '💡', '🤔', '🙌', '😊', '👀', '💯', '🚀', '😀', '🤣',
    '😍', '🥰', '😎', '😉', '😅', '😭', '😱', '😡', '🤩',
    '🤯', '🫡', '🤝', '💪', '👌', '✅', '⭐', '✨', '💬'
  )),
  member_id TEXT NOT NULL REFERENCES meetup15_members(id) ON DELETE CASCADE,
  PRIMARY KEY (reply_id, emoji, member_id)
) WITHOUT ROWID;

INSERT INTO meetup15_discussion_reactions (reply_id, emoji, member_id)
SELECT reply_id, emoji, member_id FROM meetup15_reply_reactions;

DROP TABLE meetup15_reply_reactions;

ALTER TABLE meetup15_discussion_reactions RENAME TO meetup15_reply_reactions;
CREATE INDEX meetup15_reply_reactions_member ON meetup15_reply_reactions(member_id);

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
