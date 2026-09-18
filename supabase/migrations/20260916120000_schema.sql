-- Travel OS backend foundation: types, tables, constraints, indexes.
-- Identity lives in auth.users. Passwords are never stored in public tables.
-- Trip status (upcoming / ongoing / completed) is derived from dates, not stored.

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_file THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
END;
$$;

-- If pgcrypto landed in public (local engines), expose it via extensions.
DO $$
BEGIN
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
     AND to_regprocedure('public.gen_random_bytes(integer)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION extensions.gen_random_bytes(integer)
      RETURNS bytea
      LANGUAGE sql
      AS 'SELECT public.gen_random_bytes($1)'
    $sql$;
  END IF;

  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL
     AND to_regprocedure('public.digest(bytea,text)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION extensions.digest(bytea, text)
      RETURNS bytea
      LANGUAGE sql
      AS 'SELECT public.digest($1, $2)'
    $sql$;
  END IF;
END;
$$;

CREATE TYPE public.member_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE public.invite_role AS ENUM ('editor', 'viewer');
CREATE TYPE public.invitation_status AS ENUM ('invited', 'pending', 'joined', 'revoked', 'expired');
CREATE TYPE public.trip_visibility AS ENUM ('private', 'shared');
CREATE TYPE public.expense_category AS ENUM (
  'flights',
  'lodging',
  'food',
  'transport',
  'activity',
  'shopping',
  'other'
);
CREATE TYPE public.itinerary_category AS ENUM (
  'arrival',
  'departure',
  'lodging',
  'food',
  'sight',
  'transport',
  'free'
);
CREATE TYPE public.place_status AS ENUM ('saved', 'planned', 'visited');
CREATE TYPE public.booking_type AS ENUM (
  'flight',
  'hotel',
  'train',
  'bus',
  'ticket',
  'restaurant',
  'other'
);
CREATE TYPE public.booking_status AS ENUM ('confirmed', 'pending', 'cancelled');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  short_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  initials text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  city text NOT NULL,
  country text NOT NULL,
  destination text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  budget_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (budget_amount >= 0),
  currency text NOT NULL DEFAULT 'MYR' CHECK (currency ~ '^[A-Z]{3}$'),
  visibility public.trip_visibility NOT NULL DEFAULT 'private',
  notes text NOT NULL DEFAULT '',
  timezone text,
  invite_code text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trips_dates_ok CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX trips_invite_code_uidx ON public.trips (invite_code);
CREATE INDEX trips_owner_id_idx ON public.trips (owner_id);
CREATE INDEX trips_dates_idx ON public.trips (start_date, end_date);

CREATE TABLE public.trip_members (
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  role public.member_role NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

CREATE UNIQUE INDEX trip_members_one_owner_uidx
  ON public.trip_members (trip_id)
  WHERE role = 'owner';

CREATE INDEX trip_members_user_id_idx ON public.trip_members (user_id);

CREATE TABLE public.trip_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_name text NOT NULL DEFAULT '',
  role public.invite_role NOT NULL,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL,
  invited_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  joined_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT trip_invitations_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE UNIQUE INDEX trip_invitations_token_hash_uidx
  ON public.trip_invitations (token_hash);

CREATE UNIQUE INDEX trip_invitations_open_email_uidx
  ON public.trip_invitations (trip_id, lower(email))
  WHERE status IN ('pending', 'invited');

CREATE INDEX trip_invitations_trip_id_idx ON public.trip_invitations (trip_id);

CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  address text,
  area text,
  latitude double precision,
  longitude double precision,
  notes text NOT NULL DEFAULT '',
  website text,
  opening_hours text,
  estimated_cost numeric(12, 2),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  rating numeric(3, 2) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  status public.place_status NOT NULL DEFAULT 'saved',
  planned_day date,
  map_x numeric(6, 2),
  map_y numeric(6, 2),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX places_trip_id_idx ON public.places (trip_id);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  type public.booking_type NOT NULL DEFAULT 'other',
  title text NOT NULL,
  provider text,
  confirmation_number text,
  start_date date,
  start_time text,
  end_date date,
  end_time text,
  location text,
  cost numeric(12, 2),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  notes text NOT NULL DEFAULT '',
  status public.booking_status NOT NULL DEFAULT 'pending',
  expense_id uuid,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_dates_ok CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX bookings_trip_id_idx ON public.bookings (trip_id);
CREATE INDEX bookings_start_date_idx ON public.bookings (start_date);

CREATE TABLE public.booking_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'booking-documents',
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_documents_booking_id_idx ON public.booking_documents (booking_id);
CREATE INDEX booking_documents_trip_id_idx ON public.booking_documents (trip_id);

CREATE TABLE public.itinerary_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  date date NOT NULL,
  day_number integer NOT NULL CHECK (day_number >= 1),
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, date)
);

CREATE INDEX itinerary_days_trip_id_idx ON public.itinerary_days (trip_id);

CREATE TABLE public.itinerary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  day_id uuid REFERENCES public.itinerary_days (id) ON DELETE SET NULL,
  item_date date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  time text,
  start_time text,
  end_time text,
  title text NOT NULL,
  category public.itinerary_category NOT NULL DEFAULT 'free',
  place_label text,
  notes text NOT NULL DEFAULT '',
  place_id uuid REFERENCES public.places (id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX itinerary_items_trip_date_sort_idx
  ON public.itinerary_items (trip_id, item_date, sort_order);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  converted_amount numeric(12, 2) NOT NULL CHECK (converted_amount >= 0),
  converted_currency text NOT NULL CHECK (converted_currency ~ '^[A-Z]{3}$'),
  category public.expense_category NOT NULL DEFAULT 'other',
  date date NOT NULL,
  description text NOT NULL DEFAULT '',
  paid_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  place_id uuid REFERENCES public.places (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX expenses_trip_id_date_idx ON public.expenses (trip_id, date);

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_expense_id_fkey
  FOREIGN KEY (expense_id) REFERENCES public.expenses (id) ON DELETE SET NULL;

CREATE TABLE public.expense_shares (
  expense_id uuid NOT NULL REFERENCES public.expenses (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (expense_id, user_id)
);

CREATE INDEX expense_shares_user_id_idx ON public.expense_shares (user_id);

CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  question text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX polls_trip_id_idx ON public.polls (trip_id);

CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX poll_options_poll_id_idx ON public.poll_options (poll_id);

CREATE TABLE public.poll_votes (
  poll_id uuid NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

CREATE INDEX poll_votes_option_id_idx ON public.poll_votes (option_id);

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  type text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activities_trip_id_created_at_idx
  ON public.activities (trip_id, created_at DESC);

COMMENT ON TABLE public.profiles IS '1:1 extension of auth.users. No passwords.';
COMMENT ON TABLE public.trips IS 'Dates are the source of truth for upcoming/ongoing/completed.';
COMMENT ON TABLE public.trip_members IS 'Exactly one owner per trip. Owner row is not client-writable.';
COMMENT ON TABLE public.trip_invitations IS 'token_hash is SHA-256 of a one-time raw token. Never store the raw token.';
COMMENT ON TABLE public.expense_shares IS 'Explicit unequal shares. Independent of expenses.paid_by.';
COMMENT ON TABLE public.booking_documents IS 'Storage path metadata only. File bytes are not stored here.';
COMMENT ON COLUMN public.expenses.converted_amount IS 'Snapshot at write time. Do not rewrite historically.';
