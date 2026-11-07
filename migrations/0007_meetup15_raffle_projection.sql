ALTER TABLE activity_state ADD COLUMN projection_raffle_id INTEGER
  REFERENCES meetup15_raffles(id) ON DELETE SET NULL;
