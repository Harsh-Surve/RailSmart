-- Simple stations table for typeahead (name only)
CREATE TABLE IF NOT EXISTS stations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- Insert distinct stations from trains table
INSERT INTO stations (name)
SELECT DISTINCT source AS name
FROM trains
WHERE source IS NOT NULL
UNION
SELECT DISTINCT destination AS name
FROM trains
WHERE destination IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Manually add common stations if they don't exist
INSERT INTO stations (name) VALUES
  ('Mumbai'),
  ('Mumbai CST'),
  ('Mumbai Central'),
  ('Mumbai Bandra'),
  ('Pune'),
  ('Delhi'),
  ('New Delhi'),
  ('Bangalore'),
  ('Chennai'),
  ('Kolkata'),
  ('Hyderabad'),
  ('Ahmedabad'),
  ('Jaipur'),
  ('Lucknow'),
  ('Kanpur'),
  ('Nagpur'),
  ('Indore'),
  ('Thane'),
  ('Bhopal'),
  ('Visakhapatnam')
ON CONFLICT (name) DO NOTHING;

-- Verify data
SELECT COUNT(*) AS total_stations FROM stations;
SELECT * FROM stations WHERE name ILIKE '%mum%' ORDER BY name;
