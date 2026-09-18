-- Phase 5C-6D: itinerary items may only reference a day, place, or booking
-- that belongs to the same trip.
--
-- Mechanism: UNIQUE (id, trip_id) on the parent tables plus composite FKs
-- from itinerary_items. MATCH SIMPLE keeps NULL place_id / booking_id / day_id
-- valid. The original single-column FKs stay in place so ON DELETE SET NULL
-- still nulls only the reference column, not trip_id.
-- Composite FKs use ON DELETE NO ACTION so a place/booking/day delete is not
-- turned into itinerary-item CASCADE. After the existing SET NULL fires,
-- MATCH SIMPLE no longer sees a referencing row.

CREATE UNIQUE INDEX IF NOT EXISTS itinerary_days_id_trip_id_uidx
  ON public.itinerary_days (id, trip_id);

CREATE UNIQUE INDEX IF NOT EXISTS places_id_trip_id_uidx
  ON public.places (id, trip_id);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_id_trip_id_uidx
  ON public.bookings (id, trip_id);

ALTER TABLE public.itinerary_items
  DROP CONSTRAINT IF EXISTS itinerary_items_day_trip_fkey;

ALTER TABLE public.itinerary_items
  ADD CONSTRAINT itinerary_items_day_trip_fkey
  FOREIGN KEY (day_id, trip_id)
  REFERENCES public.itinerary_days (id, trip_id)
  ON UPDATE RESTRICT
  ON DELETE NO ACTION;

ALTER TABLE public.itinerary_items
  DROP CONSTRAINT IF EXISTS itinerary_items_place_trip_fkey;

ALTER TABLE public.itinerary_items
  ADD CONSTRAINT itinerary_items_place_trip_fkey
  FOREIGN KEY (place_id, trip_id)
  REFERENCES public.places (id, trip_id)
  ON UPDATE RESTRICT
  ON DELETE NO ACTION;

ALTER TABLE public.itinerary_items
  DROP CONSTRAINT IF EXISTS itinerary_items_booking_trip_fkey;

ALTER TABLE public.itinerary_items
  ADD CONSTRAINT itinerary_items_booking_trip_fkey
  FOREIGN KEY (booking_id, trip_id)
  REFERENCES public.bookings (id, trip_id)
  ON UPDATE RESTRICT
  ON DELETE NO ACTION;

COMMENT ON CONSTRAINT itinerary_items_day_trip_fkey ON public.itinerary_items IS
  'Day must belong to the same trip. NULL day_id is allowed.';
COMMENT ON CONSTRAINT itinerary_items_place_trip_fkey ON public.itinerary_items IS
  'Place must belong to the same trip. NULL place_id is allowed.';
COMMENT ON CONSTRAINT itinerary_items_booking_trip_fkey ON public.itinerary_items IS
  'Booking must belong to the same trip. NULL booking_id is allowed.';
