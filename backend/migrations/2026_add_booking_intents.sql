-- Booking Intent Architecture
-- Separates seat locking from ticket creation.
-- Tickets are created ONLY after payment verification (atomic).
-- This eliminates duplicate tickets, ghost bookings, and retry loops.

CREATE TABLE IF NOT EXISTS booking_intents (
  id              SERIAL PRIMARY KEY,
  user_email      VARCHAR(255) NOT NULL,
  train_id        INTEGER NOT NULL REFERENCES trains(train_id),
  seat_no         VARCHAR(10) NOT NULL,
  travel_date     DATE NOT NULL,
  amount          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status          VARCHAR(30) NOT NULL DEFAULT 'PAYMENT_PENDING',
  razorpay_order_id VARCHAR(100),
  ticket_id       INTEGER REFERENCES tickets(ticket_id),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only ONE active intent per seat per train per date
-- (PAYMENT_PENDING intents lock the seat; CONFIRMED means ticket created)
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_seat_active
ON booking_intents (train_id, seat_no, travel_date)
WHERE status IN ('PAYMENT_PENDING', 'CONFIRMED');

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_intent_user ON booking_intents (user_email);
-- Fast expiry cleanup
CREATE INDEX IF NOT EXISTS idx_intent_expires ON booking_intents (expires_at) WHERE status = 'PAYMENT_PENDING';
