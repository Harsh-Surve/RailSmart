-- Email OTP verification (pre-payment)
-- Run this on your railsmart database.

CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  email VARCHAR NOT NULL,
  ticket_id INTEGER NOT NULL,
  otp VARCHAR(6) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_email_otps_lookup
  ON email_otps (email, ticket_id, verified, expires_at);
