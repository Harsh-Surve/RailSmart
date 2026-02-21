-- Waitlist queue for fully booked trains (transaction-safe promotion support)

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                SERIAL PRIMARY KEY,
  user_email        VARCHAR(255) NOT NULL,
  train_id          INTEGER NOT NULL REFERENCES trains(train_id),
  travel_date       DATE NOT NULL,
  amount            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'WAITLIST',
  waitlist_position INTEGER,
  promoted_intent_id INTEGER REFERENCES booking_intents(id),
  promoted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_entries_status_check
    CHECK (status IN ('WAITLIST', 'PROMOTED', 'CANCELLED', 'EXPIRED'))
);

-- One active waitlist entry per user per train/date
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_user_active
ON waitlist_entries (user_email, train_id, travel_date)
WHERE status = 'WAITLIST';

-- Queue ordering index (critical for promotion)
CREATE INDEX IF NOT EXISTS idx_waitlist_train_date_position
ON waitlist_entries (train_id, travel_date, waitlist_position)
WHERE status = 'WAITLIST';

-- User timeline lookup
CREATE INDEX IF NOT EXISTS idx_waitlist_user_date
ON waitlist_entries (user_email, travel_date DESC);
