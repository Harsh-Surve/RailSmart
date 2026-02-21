-- Performance indexes aligned with current query patterns.

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))';
  END IF;

  IF to_regclass('public.tickets') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_pnr ON tickets (pnr)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_user_email_booking_date ON tickets (LOWER(user_email), booking_date DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_train_date_status ON tickets (train_id, travel_date, status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_train_date_seat_active ON tickets (train_id, travel_date, seat_no) WHERE seat_no IS NOT NULL AND COALESCE(status, ''CONFIRMED'') NOT IN (''CANCELLED'', ''REFUNDED'', ''PAYMENT_FAILED'')';
  END IF;

  IF to_regclass('public.trains') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_trains_source_destination ON trains (LOWER(source), LOWER(destination))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_trains_departure ON trains (scheduled_departure)';
  END IF;

  IF to_regclass('public.payments') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payments_status_created_at ON payments (status, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payments_ticket_status ON payments (ticket_id, status)';
  END IF;

  IF to_regclass('public.booking_intents') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_booking_intents_train_date_status_expires ON booking_intents (train_id, travel_date, status, expires_at)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_booking_intents_user_status ON booking_intents (LOWER(user_email), status, expires_at)';
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)';
  END IF;
END;
$$;