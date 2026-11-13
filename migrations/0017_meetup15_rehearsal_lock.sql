ALTER TABLE activity_state ADD COLUMN rehearsal_locked INTEGER NOT NULL DEFAULT 0 CHECK (rehearsal_locked IN (0, 1));

UPDATE activity_state SET rehearsal_locked = 1 WHERE admission_open = 1;

CREATE TRIGGER meetup15_lock_rehearsal_on_admission
AFTER UPDATE OF admission_open ON activity_state
WHEN NEW.admission_open = 1 AND NEW.rehearsal_locked = 0
BEGIN
  UPDATE activity_state SET rehearsal_locked = 1 WHERE id = NEW.id;
END;
