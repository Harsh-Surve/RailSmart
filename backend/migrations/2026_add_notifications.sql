-- In-app notifications for waitlist promotion and user alerts

CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  user_email      VARCHAR(255) NOT NULL,
  type            VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
  message         TEXT NOT NULL,
  related_train_id INTEGER REFERENCES trains(train_id),
  travel_date     DATE,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications (user_email, created_at DESC)
WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
ON notifications (user_email, created_at DESC);
