-- =====================================================================
-- 0005_post_sections.sql — split timeline into 4 event sections
-- =====================================================================
-- p1: 演讲 1 (刘爵铭, 13:30-14:00)
-- p2: 演讲 2 (杨杰,   14:00-14:30)
-- breakout: 分组交流 (14:45-15:30)
-- panel:    圆桌讨论 (15:30-17:20)
-- NULL: legacy posts created before this migration (won't show in any tab,
--       but still visible on /me and on /screen when no ?section= filter).

alter table posts add column section text;

alter table posts
  add constraint posts_section_check
  check (section is null or section in ('p1', 'p2', 'breakout', 'panel'));

create index posts_section_created_idx
  on posts (section, created_at desc)
  where section is not null;
