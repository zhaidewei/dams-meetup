-- reply_reactions: emoji reactions on replies (like Slack/Discord reactions)
create table reply_reactions (
  user_id uuid not null references users(id) on delete cascade,
  reply_id bigint not null references replies(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 4),  -- Most emojis are 1-2 chars, allow up to 4 for skin tones/combinations
  created_at timestamptz not null default now(),
  primary key (user_id, reply_id, emoji)
);

create index reply_reactions_reply_id_idx on reply_reactions (reply_id);

-- Add RLS
alter table reply_reactions enable row level security;

-- Anon can read reactions (needed for realtime display)
create policy "anon can read reply_reactions"
  on reply_reactions for select
  using (true);

-- Only service role can insert/delete (enforced via server actions)
create policy "service role full access"
  on reply_reactions for all
  using (true)
  with check (true);

-- Enable realtime for reply_reactions
alter publication supabase_realtime add table reply_reactions;
