-- Add delay support for RailRadar tracking
-- Run once on your PostgreSQL database

ALTER TABLE trains
ADD COLUMN IF NOT EXISTS delay_minutes INT DEFAULT 0;
