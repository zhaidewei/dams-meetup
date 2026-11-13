-- Seed existing accounts from the published Meetup 15 agenda, matching guest names exactly.
-- The profile revision protects companies that guests have already edited or cleared.
UPDATE meetup15_members AS member
SET title = CASE
      WHEN NULLIF(TRIM(member.title), '') IS NULL OR member.title = roster.column2 || ' @ ' || roster.column3
      THEN roster.column2 ELSE member.title END,
    public_profile = CASE
      WHEN member.profile_revision = 0 AND json_type(member.public_profile, '$.company') IS NULL
      THEN json_set(member.public_profile, '$.company', roster.column3) ELSE member.public_profile END,
    profile_revision = member.profile_revision + 1
FROM (VALUES
  ('侯胜任', 'CEO', '任能科技'),
  ('方芳', 'Founder & Director', 'FF Quant Advisory'),
  ('江少杰', 'Founder', 'AI Colleagues'),
  ('Kiki Liu', 'CEO', 'Twente Medical Optics'),
  ('许焕婕', 'Founder', 'PrePlay'),
  ('徐宇迪', 'Managing Director', '100things.nl'),
  ('张霁', 'Founder', 'Arboretica'),
  ('朱颖', 'CEO', 'Agri-AI / Decilogic'),
  ('王婧昳', 'Strategy Director', 'Prosus Ventures'),
  ('彭湖湾', 'Legal Counsel', 'TomTom')
) AS roster
WHERE member.role = 'guest' AND member.display_name = roster.column1
  AND (NULLIF(TRIM(member.title), '') IS NULL
       OR member.title = roster.column2 || ' @ ' || roster.column3
       OR (member.profile_revision = 0 AND json_type(member.public_profile, '$.company') IS NULL));
