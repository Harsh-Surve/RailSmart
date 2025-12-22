-- Add status column to tickets for real-world lifecycle handling
-- Ensures cancellation works even if older schema didn't include status.

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'CONFIRMED';

UPDATE tickets
SET status = 'CONFIRMED'
WHERE status IS NULL;
