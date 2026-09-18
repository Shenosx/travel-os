-- Travel OS backend foundation: trusted functions and triggers.
-- Client writes that could spoof identity, transfer ownership, or break
-- expense share totals are rejected here even if RLS is misconfigured.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_updated_at(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
    p_table
  );
END;
$$;

SELECT public.attach_updated_at('public.profiles');
SELECT public.attach_updated_at('public.trips');
SELECT public.attach_updated_at('public.places');
SELECT public.attach_updated_at('public.bookings');
SELECT public.attach_updated_at('public.booking_documents');
SELECT public.attach_updated_at('public.itinerary_days');
SELECT public.attach_updated_at('public.itinerary_items');
SELECT public.attach_updated_at('public.expenses');
SELECT public.attach_updated_at('public.polls');
SELECT public.attach_updated_at('public.poll_options');
SELECT public.attach_updated_at('public.poll_votes');

DROP FUNCTION public.attach_updated_at(regclass);

CREATE OR REPLACE FUNCTION public.sha256_hex(p_data bytea)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_data, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.secure_random_bytes(p_n integer)
RETURNS bytea
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT gen_random_bytes(p_n);
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.email();
$$;

CREATE OR REPLACE FUNCTION public.current_trip_role(p_trip_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.role::text
  FROM public.trip_members tm
  WHERE tm.trip_id = p_trip_id
    AND tm.user_id = public.current_user_id()
$$;

CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = p_trip_id
      AND tm.user_id = public.current_user_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.log_activity(
  p_trip_id uuid,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to record activity';
  END IF;

  INSERT INTO public.activities (trip_id, actor_id, type, meta)
  VALUES (p_trip_id, v_actor, p_type, COALESCE(p_meta, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Auth user -> profile. Identity is taken from auth.users, never the client.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  display_name text;
  short_name text;
BEGIN
  display_name := COALESCE(
    NULLIF(btrim(meta ->> 'name'), ''),
    NULLIF(btrim(meta ->> 'full_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Traveler'
  );
  short_name := COALESCE(
    NULLIF(btrim(meta ->> 'short_name'), ''),
    split_part(display_name, ' ', 1)
  );

  INSERT INTO public.profiles (id, name, short_name, email, initials)
  VALUES (
    NEW.id,
    display_name,
    short_name,
    COALESCE(NEW.email, ''),
    COALESCE(
      NULLIF(btrim(meta ->> 'initials'), ''),
      upper(left(display_name, 2))
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name = CASE WHEN public.profiles.name = '' THEN EXCLUDED.name ELSE public.profiles.name END,
        short_name = CASE WHEN public.profiles.short_name = '' THEN EXCLUDED.short_name ELSE public.profiles.short_name END,
        initials = CASE WHEN public.profiles.initials = '' THEN EXCLUDED.initials ELSE public.profiles.initials END,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_user_email_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = COALESCE(NEW.email, ''),
        updated_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_email_update();

CREATE OR REPLACE FUNCTION public.tg_profiles_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Cannot create a profile for another user';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Profile id cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard ON public.profiles;
CREATE TRIGGER profiles_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_profiles_guard();

-- ---------------------------------------------------------------------------
-- Trip ownership: owner_id is always the inserting user. No owner transfer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_trips_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Must be authenticated to create a trip';
    END IF;
    NEW.owner_id := auth.uid();
    IF NEW.invite_code IS NULL OR btrim(NEW.invite_code) = '' THEN
      NEW.invite_code := encode(public.secure_random_bytes(6), 'hex');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Owner transfer is not permitted';
  END IF;

  NEW.id := OLD.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_ownership ON public.trips;
CREATE TRIGGER trips_ownership
  BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trips_ownership();

CREATE OR REPLACE FUNCTION public.tg_trips_create_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_owner_membership', 'on', true);
  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_create_owner_member ON public.trips;
CREATE TRIGGER trips_create_owner_member
  AFTER INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trips_create_owner_member();

CREATE OR REPLACE FUNCTION public.tg_trip_members_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner'
       AND current_setting('app.allow_owner_membership', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Owner membership cannot be created by clients';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' OR NEW.role = 'owner' THEN
      RAISE EXCEPTION 'Owner membership cannot be changed';
    END IF;
    IF NEW.trip_id IS DISTINCT FROM OLD.trip_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Trip membership identity cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_members_guard ON public.trip_members;
CREATE TRIGGER trip_members_guard
  BEFORE INSERT OR UPDATE ON public.trip_members
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trip_members_guard();

CREATE OR REPLACE FUNCTION public.tg_trips_before_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Trip CASCADE must be allowed to remove the owner membership and
  -- historical expenses. Independent membership/expense mutation stays blocked.
  PERFORM set_config('app.allow_owner_delete', 'on', true);
  PERFORM set_config('app.expense_write', 'on', true);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trips_before_delete ON public.trips;
CREATE TRIGGER trips_before_delete
  BEFORE DELETE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trips_before_delete();

CREATE OR REPLACE FUNCTION public.tg_trip_members_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'owner'
     AND current_setting('app.allow_owner_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Owner membership cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trip_members_delete_guard ON public.trip_members;
CREATE TRIGGER trip_members_delete_guard
  BEFORE DELETE ON public.trip_members
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trip_members_delete_guard();

CREATE OR REPLACE FUNCTION public.tg_trip_members_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.log_activity(
      NEW.trip_id,
      'member.role',
      jsonb_build_object('user_id', NEW.user_id::text, 'role', NEW.role::text)
    );
  ELSIF TG_OP = 'DELETE' THEN
    IF current_setting('app.allow_owner_delete', true) IS DISTINCT FROM 'on' THEN
      PERFORM public.log_activity(
        OLD.trip_id,
        'member.remove',
        jsonb_build_object('user_id', OLD.user_id::text, 'role', OLD.role::text)
      );
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_members_activity ON public.trip_members;
CREATE TRIGGER trip_members_activity
  AFTER UPDATE OR DELETE ON public.trip_members
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trip_members_activity();

-- ---------------------------------------------------------------------------
-- created_by / actor_id / paid_by identity guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_force_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Must be authenticated';
    END IF;
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;

  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS places_created_by ON public.places;
CREATE TRIGGER places_created_by
  BEFORE INSERT OR UPDATE ON public.places
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_force_created_by();

DROP TRIGGER IF EXISTS bookings_created_by ON public.bookings;
CREATE TRIGGER bookings_created_by
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_force_created_by();

DROP TRIGGER IF EXISTS booking_documents_created_by ON public.booking_documents;
CREATE TRIGGER booking_documents_created_by
  BEFORE INSERT OR UPDATE ON public.booking_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_force_created_by();

DROP TRIGGER IF EXISTS itinerary_items_created_by ON public.itinerary_items;
CREATE TRIGGER itinerary_items_created_by
  BEFORE INSERT OR UPDATE ON public.itinerary_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_force_created_by();

DROP TRIGGER IF EXISTS polls_created_by ON public.polls;
CREATE TRIGGER polls_created_by
  BEFORE INSERT OR UPDATE ON public.polls
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_force_created_by();

CREATE OR REPLACE FUNCTION public.tg_itinerary_items_updated_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS itinerary_items_updated_by ON public.itinerary_items;
CREATE TRIGGER itinerary_items_updated_by
  BEFORE INSERT OR UPDATE ON public.itinerary_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_itinerary_items_updated_by();

CREATE OR REPLACE FUNCTION public.tg_activities_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Must be authenticated to record activity';
    END IF;
    NEW.actor_id := auth.uid();
    RETURN NEW;
  END IF;

  IF NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN
    RAISE EXCEPTION 'activity actor_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activities_guard ON public.activities;
CREATE TRIGGER activities_guard
  BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_activities_guard();

CREATE OR REPLACE FUNCTION public.tg_poll_votes_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_poll_trip uuid;
  v_option_poll uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to vote';
  END IF;

  NEW.user_id := auth.uid();

  SELECT p.trip_id INTO v_poll_trip
  FROM public.polls p
  WHERE p.id = NEW.poll_id;

  IF v_poll_trip IS NULL THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  IF NOT public.is_trip_member(v_poll_trip) THEN
    RAISE EXCEPTION 'Only trip members can vote';
  END IF;

  SELECT o.poll_id INTO v_option_poll
  FROM public.poll_options o
  WHERE o.id = NEW.option_id;

  IF v_option_poll IS DISTINCT FROM NEW.poll_id THEN
    RAISE EXCEPTION 'Vote option does not belong to this poll';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS poll_votes_guard ON public.poll_votes;
CREATE TRIGGER poll_votes_guard
  BEFORE INSERT OR UPDATE ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_poll_votes_guard();

-- ---------------------------------------------------------------------------
-- Expense share invariant. Deferred so a transaction can replace shares.
-- Direct writes still cannot commit an invalid total.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_shares_are_valid(p_expense_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_amount numeric(12, 2);
  v_share_sum numeric(12, 2);
BEGIN
  SELECT e.amount INTO v_amount
  FROM public.expenses e
  WHERE e.id = p_expense_id;

  IF v_amount IS NULL THEN
    RETURN true;
  END IF;

  SELECT COALESCE(sum(s.amount), 0) INTO v_share_sum
  FROM public.expense_shares s
  WHERE s.expense_id = p_expense_id;

  RETURN abs(v_share_sum - v_amount) < 0.009;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_assert_expense_shares()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_expense_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    v_expense_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_expense_id := COALESCE(NEW.expense_id, OLD.expense_id);
  END IF;

  IF v_expense_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT public.expense_shares_are_valid(v_expense_id) THEN
    RAISE EXCEPTION 'Expense shares must sum to the expense amount';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS expenses_share_invariant ON public.expenses;
CREATE CONSTRAINT TRIGGER expenses_share_invariant
  AFTER INSERT OR UPDATE OF amount ON public.expenses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_assert_expense_shares();

DROP TRIGGER IF EXISTS expense_shares_invariant ON public.expense_shares;
CREATE CONSTRAINT TRIGGER expense_shares_invariant
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_shares
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_assert_expense_shares();

CREATE OR REPLACE FUNCTION public.tg_block_direct_expense_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.expense_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Expenses must be written with save_expense / delete_expense';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS expenses_block_direct ON public.expenses;
CREATE TRIGGER expenses_block_direct
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_block_direct_expense_writes();

DROP TRIGGER IF EXISTS expense_shares_block_direct ON public.expense_shares;
CREATE TRIGGER expense_shares_block_direct
  BEFORE INSERT OR UPDATE OR DELETE ON public.expense_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_block_direct_expense_writes();

CREATE OR REPLACE FUNCTION public.assert_expense_actor(p_trip_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = p_trip_id
      AND tm.user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.trip_id = p_trip_id
      AND e.paid_by = p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.expense_shares s
    JOIN public.expenses e ON e.id = s.expense_id
    WHERE e.trip_id = p_trip_id
      AND s.user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'paid_by and shares must reference trip members or historical expense actors';
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense(
  p_trip_id uuid,
  p_amount numeric,
  p_currency text,
  p_converted_amount numeric,
  p_converted_currency text,
  p_category public.expense_category,
  p_date date,
  p_description text,
  p_paid_by uuid,
  p_shares jsonb,
  p_id uuid DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL,
  p_place_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_created_by uuid;
  v_share jsonb;
  v_is_update boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  v_role := public.current_trip_role(p_trip_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this trip';
  END IF;

  IF p_shares IS NULL OR jsonb_typeof(p_shares) <> 'array' OR jsonb_array_length(p_shares) < 1 THEN
    RAISE EXCEPTION 'Expense shares are required';
  END IF;

  PERFORM public.assert_expense_actor(p_trip_id, p_paid_by);

  FOR v_share IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    IF (v_share ->> 'user_id') IS NULL THEN
      RAISE EXCEPTION 'Each share must include user_id';
    END IF;
    PERFORM public.assert_expense_actor(p_trip_id, (v_share ->> 'user_id')::uuid);
  END LOOP;

  PERFORM set_config('app.expense_write', 'on', true);

  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = p_id) THEN
    v_is_update := true;
    SELECT e.created_by, e.id
    INTO v_created_by, v_id
    FROM public.expenses e
    WHERE e.id = p_id
      AND e.trip_id = p_trip_id
    FOR UPDATE;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Expense not found on this trip';
    END IF;

    IF v_role <> 'owner' AND v_created_by <> v_actor THEN
      RAISE EXCEPTION 'Editors can only modify their own expenses';
    END IF;
    IF v_role NOT IN ('owner', 'editor') THEN
      RAISE EXCEPTION 'Viewers cannot modify expenses';
    END IF;

    UPDATE public.expenses
    SET amount = p_amount,
        currency = p_currency,
        converted_amount = p_converted_amount,
        converted_currency = p_converted_currency,
        category = p_category,
        date = p_date,
        description = COALESCE(p_description, ''),
        paid_by = p_paid_by,
        booking_id = p_booking_id,
        place_id = p_place_id
    WHERE id = v_id;

    DELETE FROM public.expense_shares WHERE expense_id = v_id;
  ELSE
    IF v_role NOT IN ('owner', 'editor') THEN
      RAISE EXCEPTION 'Viewers cannot create expenses';
    END IF;

    v_id := COALESCE(p_id, gen_random_uuid());

    INSERT INTO public.expenses (
      id,
      trip_id,
      amount,
      currency,
      converted_amount,
      converted_currency,
      category,
      date,
      description,
      paid_by,
      booking_id,
      place_id,
      created_by
    ) VALUES (
      v_id,
      p_trip_id,
      p_amount,
      p_currency,
      p_converted_amount,
      p_converted_currency,
      p_category,
      p_date,
      COALESCE(p_description, ''),
      p_paid_by,
      p_booking_id,
      p_place_id,
      v_actor
    );
  END IF;

  INSERT INTO public.expense_shares (expense_id, user_id, amount)
  SELECT
    v_id,
    (share ->> 'user_id')::uuid,
    (share ->> 'amount')::numeric
  FROM jsonb_array_elements(p_shares) AS share;

  IF NOT public.expense_shares_are_valid(v_id) THEN
    RAISE EXCEPTION 'Expense shares must sum to the expense amount';
  END IF;

  PERFORM public.log_activity(
    p_trip_id,
    CASE WHEN v_is_update THEN 'expense.update' ELSE 'expense.add' END,
    jsonb_build_object('title', COALESCE(p_description, ''), 'expense_id', v_id::text)
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_role text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT * INTO v_expense
  FROM public.expenses
  WHERE id = p_id
  FOR UPDATE;

  IF v_expense.id IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  v_role := public.current_trip_role(v_expense.trip_id);
  IF v_role = 'owner' OR (v_role = 'editor' AND v_expense.created_by = v_actor) THEN
    PERFORM set_config('app.expense_write', 'on', true);
    DELETE FROM public.expenses WHERE id = p_id;
    PERFORM public.log_activity(
      v_expense.trip_id,
      'expense.delete',
      jsonb_build_object('title', v_expense.description, 'expense_id', p_id::text)
    );
    RETURN;
  END IF;

  RAISE EXCEPTION 'Not allowed to delete this expense';
END;
$$;

-- ---------------------------------------------------------------------------
-- Invitations. Raw token is returned once. Only the SHA-256 hash is stored.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_trip_id uuid,
  p_email text,
  p_role text,
  p_invited_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_role public.invite_role;
  v_raw bytea;
  v_token text;
  v_hash text;
  v_id uuid;
  v_expires timestamptz := now() + interval '14 days';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF public.current_trip_role(p_trip_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the trip owner can create invitations';
  END IF;

  IF p_role NOT IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Invitations cannot grant owner';
  END IF;

  v_role := p_role::public.invite_role;
  v_email := lower(btrim(p_email));
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.trip_members tm
    JOIN public.profiles p ON p.id = tm.user_id
    WHERE tm.trip_id = p_trip_id
      AND lower(p.email) = v_email
  ) THEN
    RAISE EXCEPTION 'That person is already on this trip';
  END IF;

  UPDATE public.trip_invitations
  SET status = 'revoked'
  WHERE trip_id = p_trip_id
    AND lower(email) = v_email
    AND status IN ('pending', 'invited');

  v_raw := public.secure_random_bytes(32);
  v_token := encode(v_raw, 'hex');
  v_hash := public.sha256_hex(v_raw);
  v_id := gen_random_uuid();

  INSERT INTO public.trip_invitations (
    id,
    trip_id,
    email,
    invited_name,
    role,
    status,
    token_hash,
    invited_by,
    expires_at
  ) VALUES (
    v_id,
    p_trip_id,
    v_email,
    COALESCE(p_invited_name, ''),
    v_role,
    'pending',
    v_hash,
    v_actor,
    v_expires
  );

  PERFORM public.log_activity(
    p_trip_id,
    'member.invite',
    jsonb_build_object('name', COALESCE(NULLIF(p_invited_name, ''), v_email), 'role', v_role::text)
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'token', v_token,
    'expires_at', v_expires
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_raw_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := lower(COALESCE(auth.email(), ''));
  v_raw bytea;
  v_hash text;
  v_invite public.trip_invitations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  BEGIN
    v_raw := decode(btrim(p_raw_token), 'hex');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invitation is invalid';
  END;

  IF octet_length(v_raw) <> 32 THEN
    RAISE EXCEPTION 'Invitation is invalid';
  END IF;

  v_hash := public.sha256_hex(v_raw);

  SELECT *
  INTO v_invite
  FROM public.trip_invitations
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid';
  END IF;

  IF v_invite.status NOT IN ('pending', 'invited') THEN
    RAISE EXCEPTION 'Invitation cannot be reused';
  END IF;

  IF v_invite.expires_at <= now() THEN
    UPDATE public.trip_invitations
    SET status = 'expired'
    WHERE id = v_invite.id AND status IN ('pending', 'invited');
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  IF v_email = '' OR v_email IS DISTINCT FROM v_invite.email THEN
    RAISE EXCEPTION 'This invitation belongs to someone else';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = v_invite.trip_id
      AND tm.user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Already a member of this trip';
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (v_invite.trip_id, v_actor, v_invite.role::text::public.member_role);

  UPDATE public.trip_invitations
  SET status = 'joined',
      joined_user_id = v_actor,
      accepted_at = now()
  WHERE id = v_invite.id;

  UPDATE public.trips
  SET visibility = 'shared'
  WHERE id = v_invite.trip_id
    AND visibility IS DISTINCT FROM 'shared';

  PERFORM public.log_activity(
    v_invite.trip_id,
    'member.join',
    jsonb_build_object('name', COALESCE(NULLIF(v_invite.invited_name, ''), v_email))
  );

  RETURN v_invite.trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.trip_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT * INTO v_invite
  FROM public.trip_invitations
  WHERE id = p_id
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF public.current_trip_role(v_invite.trip_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the trip owner can revoke invitations';
  END IF;

  IF v_invite.status NOT IN ('pending', 'invited') THEN
    RAISE EXCEPTION 'Invitation is no longer open';
  END IF;

  UPDATE public.trip_invitations
  SET status = 'revoked'
  WHERE id = p_id;
END;
$$;

-- create_invitation / accept_invitation run as the function owner, so the
-- client cannot insert token hashes. Column grants also hide token_hash.

COMMENT ON FUNCTION public.create_invitation(uuid, text, text, text) IS
  'Owner-only. Returns the raw token once. Stores SHA-256 only.';
COMMENT ON FUNCTION public.accept_invitation(text) IS
  'Invitee-only. Role comes from the stored invitation, never the client.';
COMMENT ON FUNCTION public.save_expense IS
  'Canonical expense write path. Share totals are validated before commit.';
