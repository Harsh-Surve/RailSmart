-- Live positions for RailRadar simulation / ingestion
CREATE TABLE IF NOT EXISTS live_positions (
  id SERIAL PRIMARY KEY,
  train_id INTEGER NOT NULL UNIQUE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  speed_kmh DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_positions_train_id ON live_positions(train_id);
