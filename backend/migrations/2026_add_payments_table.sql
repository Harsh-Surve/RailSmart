-- Payments ledger table for revenue reconciliation.
-- Admin revenue is computed ONLY from this table (status = 'SUCCESS').

CREATE TABLE IF NOT EXISTS payments (
  payment_id    SERIAL PRIMARY KEY,
  ticket_id     INTEGER NOT NULL,
  amount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  date          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns that may be missing from older schema
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Index for fast revenue queries
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_ticket ON payments (ticket_id);

-- Back-fill: create payment records for existing PAID tickets
INSERT INTO payments (ticket_id, razorpay_payment_id, razorpay_order_id, amount, status, created_at)
SELECT
  t.ticket_id,
  t.payment_id,
  t.payment_order_id,
  t.price,
  'SUCCESS',
  COALESCE(t.booking_date, NOW())
FROM tickets t
WHERE UPPER(COALESCE(t.payment_status, '')) = 'PAID'
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.ticket_id = t.ticket_id AND p.status = 'SUCCESS'
  );
