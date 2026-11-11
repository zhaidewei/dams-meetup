ALTER TABLE meetup15_members ADD COLUMN public_profile TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(public_profile) AND json_type(public_profile) = 'object');
