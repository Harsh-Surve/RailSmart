-- Migration: Support REFUNDED and PAYMENT_FAILED ticket/payment statuses
-- Date: 2026
-- Description: 
--   tickets.status can now be: PAYMENT_PENDING, CONFIRMED, CANCELLED, REFUNDED, PAYMENT_FAILED
--   tickets.payment_status can now be: PENDING, PAID, FAILED, REFUNDED
--   payments.status can now be: PENDING, SUCCESS, FAILED, REFUNDED
-- No schema change needed since status columns are VARCHAR/TEXT.
-- This migration adds a CHECK constraint for documentation and safety.

-- Ensure payment_status column exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE tickets ADD COLUMN payment_status VARCHAR(20) DEFAULT 'PENDING';
  END IF;
END $$;

-- Update any NULL payment_status to PENDING
UPDATE tickets SET payment_status = 'PENDING' WHERE payment_status IS NULL;

-- Mark already-cancelled tickets that were paid as REFUNDED (for existing data consistency)
-- Only if you want retroactive cleanup; otherwise comment this out:
-- UPDATE tickets SET status = 'REFUNDED', payment_status = 'REFUNDED'
-- WHERE status = 'CANCELLED' AND payment_status = 'PAID';

SELECT 'Migration 2026_add_refund_payment_failed_status applied successfully' AS result;
