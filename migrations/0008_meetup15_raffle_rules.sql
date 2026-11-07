ALTER TABLE meetup15_raffles ADD COLUMN weighted INTEGER CHECK (weighted IN (0, 1));
ALTER TABLE meetup15_raffles ADD COLUMN require_participation INTEGER CHECK (require_participation IN (0, 1));
