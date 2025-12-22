-- Create stations table if it doesn't exist
CREATE TABLE IF NOT EXISTS stations (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);

-- Insert unique stations from trains table (avoiding duplicates)
INSERT INTO stations (code, name)
SELECT DISTINCT 
  SUBSTRING(source FROM 1 FOR 3) AS code,
  source AS name
FROM trains
WHERE source IS NOT NULL
ON CONFLICT (code) DO NOTHING;

-- Add destination stations
INSERT INTO stations (code, name)
SELECT DISTINCT 
  SUBSTRING(destination FROM 1 FOR 3) AS code,
  destination AS name
FROM trains
WHERE destination IS NOT NULL
ON CONFLICT (code) DO NOTHING;

-- Manually add common Indian Railway stations with proper codes
INSERT INTO stations (code, name) VALUES
  ('CSMT', 'Mumbai CST'),
  ('BCT', 'Mumbai Central'),
  ('BDTS', 'Mumbai Bandra Terminus'),
  ('LTT', 'Mumbai Lokmanya Tilak'),
  ('DR', 'Mumbai Dadar'),
  ('KYN', 'Mumbai Kalyan'),
  ('TNA', 'Mumbai Thane'),
  ('PNVL', 'Mumbai Panvel'),
  ('PUNE', 'Pune'),
  ('DL', 'Delhi'),
  ('NDLS', 'New Delhi'),
  ('DDN', 'Dehradun'),
  ('ADI', 'Ahmedabad'),
  ('BRC', 'Vadodara'),
  ('ST', 'Surat'),
  ('BPL', 'Bhopal'),
  ('JBP', 'Jabalpur'),
  ('NGP', 'Nagpur'),
  ('HWH', 'Howrah'),
  ('KOAA', 'Kolkata'),
  ('MAS', 'Chennai Central'),
  ('BLR', 'Bangalore'),
  ('HYB', 'Hyderabad')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
