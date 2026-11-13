-- Keep the old Worker compatible until the new deployment takes traffic.
ALTER TABLE meetup15_qa_rounds ADD COLUMN title TEXT;
ALTER TABLE meetup15_qa_rounds ADD COLUMN agenda_start TEXT;
CREATE TABLE meetup15_qa_legacy_guest_backup AS SELECT id, guest_id FROM meetup15_qa_rounds;
ALTER TABLE meetup15_qa_rounds DROP COLUMN guest_id;
ALTER TABLE meetup15_qa_rounds ADD COLUMN guest_id TEXT REFERENCES meetup15_members(id);
UPDATE meetup15_qa_rounds
SET guest_id = (SELECT backup.guest_id FROM meetup15_qa_legacy_guest_backup backup WHERE backup.id = meetup15_qa_rounds.id);
DROP TABLE meetup15_qa_legacy_guest_backup;
