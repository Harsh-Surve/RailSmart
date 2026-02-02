-- Migration: Clean Train Schedule Model
-- Purpose: Convert from hardcoded datetime to daily schedule times
-- Date: 2026-02-03

-- Step 1: Add new time-only columns for schedule
ALTER TABLE trains 
ADD COLUMN IF NOT EXISTS scheduled_departure TIME,
ADD COLUMN IF NOT EXISTS scheduled_arrival TIME,
ADD COLUMN IF NOT EXISTS runs_on VARCHAR(20) DEFAULT 'DAILY';

-- Step 2: Migrate existing data - extract time from timestamp
UPDATE trains 
SET 
  scheduled_departure = departure_time::TIME,
  scheduled_arrival = arrival_time::TIME,
  runs_on = 'DAILY'
WHERE scheduled_departure IS NULL;

-- Step 3: Add comments for clarity
COMMENT ON COLUMN trains.scheduled_departure IS 'Daily departure time (HH:MM:SS)';
COMMENT ON COLUMN trains.scheduled_arrival IS 'Daily arrival time (HH:MM:SS)';
COMMENT ON COLUMN trains.runs_on IS 'DAILY, WEEKDAYS, WEEKENDS, or specific days like MON,WED,FRI';

-- Note: We keep the old departure_time/arrival_time columns for backward compatibility
-- They can be removed in a future migration once all code is updated
