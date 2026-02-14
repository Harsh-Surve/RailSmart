-- Add idempotent booking_key column to tickets table.
-- Prevents duplicate ticket creation on retries / double-clicks.
-- booking_key = email_trainId_date_seat (unique per non-cancelled ticket)

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS booking_key VARCHAR(255);

-- Back-fill existing rows so the column isn't NULL for old data
UPDATE tickets
SET booking_key = user_email || '_' || train_id || '_' || travel_date || '_' || seat_no
WHERE booking_key IS NULL;

-- Create a UNIQUE partial index: only enforce uniqueness on non-cancelled tickets
-- This allows re-booking the same seat after cancellation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_booking_key_active
ON tickets (booking_key)
WHERE COALESCE(status, 'CONFIRMED') <> 'CANCELLED';
