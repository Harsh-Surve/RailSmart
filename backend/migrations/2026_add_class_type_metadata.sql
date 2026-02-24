-- Add class_type metadata for lightweight class-aware pricing and booking context.
-- Seat inventory remains unified at train level in this phase.

ALTER TABLE IF EXISTS tickets
ADD COLUMN IF NOT EXISTS class_type VARCHAR(20) DEFAULT 'SL';

ALTER TABLE IF EXISTS booking_intents
ADD COLUMN IF NOT EXISTS class_type VARCHAR(20) DEFAULT 'SL';

UPDATE tickets
SET class_type = 'SL'
WHERE class_type IS NULL OR TRIM(class_type) = '';

UPDATE booking_intents
SET class_type = 'SL'
WHERE class_type IS NULL OR TRIM(class_type) = '';

CREATE INDEX IF NOT EXISTS idx_tickets_train_date_class
ON tickets (train_id, travel_date, class_type);

CREATE INDEX IF NOT EXISTS idx_booking_intents_train_date_class
ON booking_intents (train_id, travel_date, class_type)
WHERE status IN ('PAYMENT_PENDING', 'CONFIRMED');
