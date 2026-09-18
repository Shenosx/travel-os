-- Phase 5C-10: Cloud Trip postgres_changes publication.
-- Does not change RLS. Replica identity FULL lets DELETE events include
-- non-PK columns such as trip_id so filtered subscriptions can fire.
-- poll_options, poll_votes, and expense_shares are intentionally omitted:
-- those tables have no trip_id, and the app refreshes from trip-scoped parents
-- (polls / expenses / activities) instead of a global subscription.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.trips',
    'public.trip_members',
    'public.trip_invitations',
    'public.itinerary_days',
    'public.itinerary_items',
    'public.places',
    'public.bookings',
    'public.booking_documents',
    'public.expenses',
    'public.polls',
    'public.activities'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END
$$;

ALTER TABLE public.trips REPLICA IDENTITY FULL;
ALTER TABLE public.trip_members REPLICA IDENTITY FULL;
ALTER TABLE public.trip_invitations REPLICA IDENTITY FULL;
ALTER TABLE public.itinerary_days REPLICA IDENTITY FULL;
ALTER TABLE public.itinerary_items REPLICA IDENTITY FULL;
ALTER TABLE public.places REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.booking_documents REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.polls REPLICA IDENTITY FULL;
ALTER TABLE public.activities REPLICA IDENTITY FULL;
