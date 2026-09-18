-- Travel OS backend foundation: grants and row-level security.
-- Helpers inspect only the caller's membership and are SECURITY DEFINER
-- with search_path = public to avoid recursive RLS.

CREATE OR REPLACE FUNCTION public.tg_booking_documents_sync_trip()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trip uuid;
BEGIN
  SELECT b.trip_id INTO v_trip
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  IF v_trip IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  NEW.trip_id := v_trip;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_documents_sync_trip ON public.booking_documents;
CREATE TRIGGER booking_documents_sync_trip
  BEFORE INSERT OR UPDATE OF booking_id, trip_id ON public.booking_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_booking_documents_sync_trip();

CREATE OR REPLACE VIEW public.trip_invitation_summaries
WITH (security_invoker = true) AS
SELECT
  id,
  trip_id,
  email,
  invited_name,
  role,
  status,
  invited_by,
  joined_user_id,
  expires_at,
  created_at,
  accepted_at
FROM public.trip_invitations;

REVOKE ALL ON FUNCTION public.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_trip_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_trip_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_expense(uuid, numeric, text, numeric, text, public.expense_category, date, text, uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_expense(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invitation(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sha256_hex(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.secure_random_bytes(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_shares_are_valid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_expense_actor(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_user_email_update() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_trip_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense(uuid, numeric, text, numeric, text, public.expense_category, date, text, uuid, jsonb, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO service_role';
  END IF;
END;
$$;

GRANT USAGE ON TYPE public.member_role TO authenticated;
GRANT USAGE ON TYPE public.invite_role TO authenticated;
GRANT USAGE ON TYPE public.invitation_status TO authenticated;
GRANT USAGE ON TYPE public.trip_visibility TO authenticated;
GRANT USAGE ON TYPE public.expense_category TO authenticated;
GRANT USAGE ON TYPE public.itinerary_category TO authenticated;
GRANT USAGE ON TYPE public.place_status TO authenticated;
GRANT USAGE ON TYPE public.booking_type TO authenticated;
GRANT USAGE ON TYPE public.booking_status TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.trips,
  public.trip_members,
  public.places,
  public.bookings,
  public.booking_documents,
  public.itinerary_days,
  public.itinerary_items,
  public.polls,
  public.poll_options,
  public.poll_votes
TO authenticated;

GRANT SELECT ON public.expenses TO authenticated;
GRANT SELECT ON public.expense_shares TO authenticated;
GRANT SELECT ON public.activities TO authenticated;
GRANT DELETE ON public.activities TO authenticated;
GRANT SELECT ON public.trip_invitation_summaries TO authenticated;

REVOKE ALL ON public.trip_invitations FROM authenticated;
GRANT SELECT (
  id,
  trip_id,
  email,
  invited_name,
  role,
  status,
  invited_by,
  joined_user_id,
  expires_at,
  created_at,
  accepted_at
) ON public.trip_invitations TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Profiles -----------------------------------------------------------------

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = public.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.trip_members theirs
      WHERE theirs.user_id = profiles.id
        AND public.is_trip_member(theirs.trip_id)
    )
  );

CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = public.current_user_id())
  WITH CHECK (id = public.current_user_id());

-- Trips --------------------------------------------------------------------

CREATE POLICY trips_select_member ON public.trips
  FOR SELECT TO authenticated
  USING (
    public.is_trip_member(id)
    OR owner_id = public.current_user_id()
  );

CREATE POLICY trips_insert_own ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_user_id());

CREATE POLICY trips_update_owner ON public.trips
  FOR UPDATE TO authenticated
  USING (public.current_trip_role(id) = 'owner')
  WITH CHECK (
    public.current_trip_role(id) = 'owner'
    AND owner_id = public.current_user_id()
  );

CREATE POLICY trips_delete_owner ON public.trips
  FOR DELETE TO authenticated
  USING (public.current_trip_role(id) = 'owner');

-- Members ------------------------------------------------------------------

CREATE POLICY trip_members_select ON public.trip_members
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY trip_members_update_owner ON public.trip_members
  FOR UPDATE TO authenticated
  USING (
    public.current_trip_role(trip_id) = 'owner'
    AND role <> 'owner'
  )
  WITH CHECK (
    public.current_trip_role(trip_id) = 'owner'
    AND role <> 'owner'
  );

CREATE POLICY trip_members_delete_owner ON public.trip_members
  FOR DELETE TO authenticated
  USING (
    public.current_trip_role(trip_id) = 'owner'
    AND role <> 'owner'
  );

-- Invitations --------------------------------------------------------------

CREATE POLICY trip_invitations_select ON public.trip_invitations
  FOR SELECT TO authenticated
  USING (
    public.current_trip_role(trip_id) = 'owner'
    OR (
      lower(email) = lower(COALESCE(public.current_user_email(), ''))
      AND status IN ('pending', 'invited')
    )
  );

-- Itinerary ----------------------------------------------------------------

CREATE POLICY itinerary_days_select ON public.itinerary_days
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY itinerary_days_write ON public.itinerary_days
  FOR ALL TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY itinerary_items_select ON public.itinerary_items
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY itinerary_items_insert ON public.itinerary_items
  FOR INSERT TO authenticated
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY itinerary_items_update ON public.itinerary_items
  FOR UPDATE TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY itinerary_items_delete ON public.itinerary_items
  FOR DELETE TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'));

-- Places -------------------------------------------------------------------

CREATE POLICY places_select ON public.places
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY places_insert ON public.places
  FOR INSERT TO authenticated
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY places_update ON public.places
  FOR UPDATE TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY places_delete ON public.places
  FOR DELETE TO authenticated
  USING (
    public.current_trip_role(trip_id) = 'owner'
    OR (
      public.current_trip_role(trip_id) = 'editor'
      AND created_by = public.current_user_id()
    )
  );

-- Bookings -----------------------------------------------------------------

CREATE POLICY bookings_select ON public.bookings
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY bookings_insert ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY bookings_update ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY bookings_delete ON public.bookings
  FOR DELETE TO authenticated
  USING (
    public.current_trip_role(trip_id) = 'owner'
    OR (
      public.current_trip_role(trip_id) = 'editor'
      AND created_by = public.current_user_id()
    )
  );

CREATE POLICY booking_documents_select ON public.booking_documents
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY booking_documents_write ON public.booking_documents
  FOR ALL TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

-- Expenses: SELECT only. Writes go through save_expense / delete_expense. --

CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY expense_shares_select ON public.expense_shares
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_shares.expense_id
        AND public.is_trip_member(e.trip_id)
    )
  );

-- Polls --------------------------------------------------------------------

CREATE POLICY polls_select ON public.polls
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY polls_insert ON public.polls
  FOR INSERT TO authenticated
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY polls_update ON public.polls
  FOR UPDATE TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY polls_delete ON public.polls
  FOR DELETE TO authenticated
  USING (public.current_trip_role(trip_id) IN ('owner', 'editor'));

CREATE POLICY poll_options_select ON public.poll_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_options.poll_id
        AND public.is_trip_member(p.trip_id)
    )
  );

CREATE POLICY poll_options_write ON public.poll_options
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_options.poll_id
        AND public.current_trip_role(p.trip_id) IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_options.poll_id
        AND public.current_trip_role(p.trip_id) IN ('owner', 'editor')
    )
  );

CREATE POLICY poll_votes_select ON public.poll_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_votes.poll_id
        AND public.is_trip_member(p.trip_id)
    )
  );

CREATE POLICY poll_votes_insert ON public.poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_user_id()
    AND EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_votes.poll_id
        AND public.is_trip_member(p.trip_id)
    )
  );

CREATE POLICY poll_votes_update ON public.poll_votes
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (
    user_id = public.current_user_id()
    AND EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_votes.poll_id
        AND public.is_trip_member(p.trip_id)
    )
  );

CREATE POLICY poll_votes_delete ON public.poll_votes
  FOR DELETE TO authenticated
  USING (user_id = public.current_user_id());

-- Activities ---------------------------------------------------------------

CREATE POLICY activities_select ON public.activities
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

CREATE POLICY activities_delete_owner ON public.activities
  FOR DELETE TO authenticated
  USING (public.current_trip_role(trip_id) = 'owner');
