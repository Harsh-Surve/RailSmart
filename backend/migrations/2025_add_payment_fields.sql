-- Add payment tracking columns for Razorpay integration (safe for test mode)

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS payment_order_id VARCHAR(100);

UPDATE tickets
SET payment_status = 'PAID'
WHERE payment_status IS NULL;
