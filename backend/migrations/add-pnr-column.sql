-- Add PNR column to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pnr VARCHAR(15);

-- Update existing tickets with generated PNRs
UPDATE tickets 
SET pnr = LPAD(CAST(train_id AS TEXT), 3, '0') || 
          TO_CHAR(travel_date, 'YYYYMMDD') || 
          LPAD(CAST(ticket_id AS TEXT), 4, '0')
WHERE pnr IS NULL;

-- Add index for faster PNR lookups
CREATE INDEX IF NOT EXISTS idx_tickets_pnr ON tickets(pnr);

-- Verify
SELECT ticket_id, pnr, train_id, travel_date FROM tickets LIMIT 5;
