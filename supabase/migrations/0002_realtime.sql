-- Enable Realtime publication for tables that benefit from live subscriptions.
-- This lets clients receive INSERT/UPDATE/DELETE events without polling.

alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table replies;
alter publication supabase_realtime add table likes;
alter publication supabase_realtime add table poll_votes;
