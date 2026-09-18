-- Phase 5C-7: expenses may only reference a place or booking on the same trip.
--
-- Mechanism matches Phase 5C-6D. UNIQUE (id, trip_id) already exists on
-- places and bookings; recreate it here so this migration is self-contained.
-- Composite FKs enforce same-trip identity. MATCH SIMPLE keeps NULL
-- place_id / booking_id valid. Original single-column FKs stay so
-- ON DELETE SET NULL nulls only the reference column, not trip_id.
-- save_expense remains the write path; a composite FK failure aborts that
-- function and does not leave a partial header or share row.
--
-- ON DELETE SET NULL updates expenses.place_id / booking_id. The existing
-- direct-write guard must allow that referential clear without opening a
-- general UPDATE path. Clients still have no expenses UPDATE RLS policy.

CREATE UNIQUE INDEX IF NOT EXISTS places_id_trip_id_uidx
  ON public.places (id, trip_id);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_id_trip_id_uidx
  ON public.bookings (id, trip_id);

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_place_trip_fkey;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_place_trip_fkey
  FOREIGN KEY (place_id, trip_id)
  REFERENCES public.places (id, trip_id)
  ON UPDATE RESTRICT
  ON DELETE NO ACTION;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_booking_trip_fkey;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_booking_trip_fkey
  FOREIGN KEY (booking_id, trip_id)
  REFERENCES public.bookings (id, trip_id)
  ON UPDATE RESTRICT
  ON DELETE NO ACTION;

COMMENT ON CONSTRAINT expenses_place_trip_fkey ON public.expenses IS
  'Place must belong to the same trip. NULL place_id is allowed.';
COMMENT ON CONSTRAINT expenses_booking_trip_fkey ON public.expenses IS
  'Booking must belong to the same trip. NULL booking_id is allowed.';

CREATE OR REPLACE FUNCTION public.tg_block_direct_expense_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.expense_write', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Referential SET NULL of place_id / booking_id only. All other columns stay.
  IF TG_OP = 'UPDATE'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.converted_amount IS NOT DISTINCT FROM OLD.converted_amount
     AND NEW.converted_currency IS NOT DISTINCT FROM OLD.converted_currency
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.paid_by IS NOT DISTINCT FROM OLD.paid_by
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND (NEW.place_id IS NOT DISTINCT FROM OLD.place_id OR NEW.place_id IS NULL)
     AND (NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id OR NEW.booking_id IS NULL)
     AND (NEW.place_id IS DISTINCT FROM OLD.place_id OR NEW.booking_id IS DISTINCT FROM OLD.booking_id)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Expenses must be written with save_expense / delete_expense';
END;
$$;
