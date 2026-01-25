-- Add rate-limiting / brute-force protection fields for email OTPs
-- Safe to run multiple times.

ALTER TABLE email_otps
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- Helpful for send rate limiting (count recent OTPs per email)
CREATE INDEX IF NOT EXISTS idx_email_otps_email_created_at
  ON email_otps (email, created_at DESC);
