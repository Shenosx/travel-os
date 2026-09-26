-- Phase 5C-9: private booking-docs bucket, storage RLS, and document integrity.
--
-- Existing booking_documents columns are unchanged. The Phase 5B default bucket
-- name was 'booking-documents'; this phase uses the architecture name
-- 'booking-docs' and aligns the column default. Clients cannot spoof created_by
-- (existing tg_force_created_by). trip_id is forced from the booking.
--
-- Storage and Postgres are separate systems. Metadata DELETE attempts to remove
-- the matching storage.objects catalog row. Hosted S3 bytes still require the
-- Storage API (client delete) or later orphan cleanup.

-- ---------------------------------------------------------------------------
-- Same-trip composite FK: document.trip_id must match bookings.trip_id
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS bookings_id_trip_id_uidx
  ON public.bookings (id, trip_id);

ALTER TABLE public.booking_documents
  DROP CONSTRAINT IF EXISTS booking_documents_booking_trip_fkey;

ALTER TABLE public.booking_documents
  ADD CONSTRAINT booking_documents_booking_trip_fkey
  FOREIGN KEY (booking_id, trip_id)
  REFERENCES public.bookings (id, trip_id)
  ON UPDATE RESTRICT
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT booking_documents_booking_trip_fkey ON public.booking_documents IS
  'A booking document must belong to the same trip as its booking.';

ALTER TABLE public.booking_documents
  ALTER COLUMN storage_bucket SET DEFAULT 'booking-docs';

ALTER TABLE public.booking_documents
  DROP CONSTRAINT IF EXISTS booking_documents_bucket_check;

ALTER TABLE public.booking_documents
  ADD CONSTRAINT booking_documents_bucket_check
  CHECK (storage_bucket = 'booking-docs');

ALTER TABLE public.booking_documents
  DROP CONSTRAINT IF EXISTS booking_documents_size_bytes_check;

ALTER TABLE public.booking_documents
  ADD CONSTRAINT booking_documents_size_bytes_check
  CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 10485760));

ALTER TABLE public.booking_documents
  DROP CONSTRAINT IF EXISTS booking_documents_mime_check;

ALTER TABLE public.booking_documents
  ADD CONSTRAINT booking_documents_mime_check
  CHECK (
    mime_type IS NULL
    OR mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'text/plain')
  );

CREATE UNIQUE INDEX IF NOT EXISTS booking_documents_storage_path_uidx
  ON public.booking_documents (storage_bucket, storage_path);

-- ---------------------------------------------------------------------------
-- Path parser: {trip_id}/{booking_id}/{document_id}[.pdf|.jpg|.jpeg|.png|.txt]
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parse_booking_doc_path(p_name text)
RETURNS TABLE(trip_id uuid, booking_id uuid, document_id uuid)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    parts[1]::uuid,
    parts[2]::uuid,
    parts[3]::uuid
  FROM regexp_matches(
    COALESCE(p_name, ''),
    '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(\.(pdf|jpe?g|png|txt))?$'
  ) AS parts
  WHERE position('..' in COALESCE(p_name, '')) = 0
    AND position('\' in COALESCE(p_name, '')) = 0;
$$;

CREATE OR REPLACE FUNCTION public.booking_doc_object_allowed(p_name text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip uuid;
  v_booking uuid;
  v_role text;
BEGIN
  SELECT p.trip_id, p.booking_id
    INTO v_trip, v_booking
  FROM public.parse_booking_doc_path(p_name) p;

  IF v_trip IS NULL OR v_booking IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = v_booking
      AND b.trip_id = v_trip
  ) THEN
    RETURN false;
  END IF;

  v_role := public.current_trip_role(v_trip);
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF p_action = 'read' THEN
    RETURN true;
  END IF;

  IF p_action = 'write' THEN
    RETURN v_role IN ('owner', 'editor');
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.parse_booking_doc_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_doc_object_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parse_booking_doc_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_doc_object_allowed(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Force trip_id from the booking; reject moves and untrusted paths.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_booking_documents_sync_trip()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trip uuid;
  v_path_trip uuid;
  v_path_booking uuid;
  v_path_document uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
      RAISE EXCEPTION 'Booking document cannot move to another booking';
    END IF;
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
      RAISE EXCEPTION 'Booking document storage path cannot change';
    END IF;
    IF NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket THEN
      RAISE EXCEPTION 'Booking document bucket cannot change';
    END IF;
  END IF;

  SELECT b.trip_id INTO v_trip
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  IF v_trip IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  NEW.trip_id := v_trip;
  NEW.storage_bucket := 'booking-docs';

  SELECT p.trip_id, p.booking_id, p.document_id
    INTO v_path_trip, v_path_booking, v_path_document
  FROM public.parse_booking_doc_path(NEW.storage_path) p;

  IF v_path_trip IS NULL
     OR v_path_trip <> NEW.trip_id
     OR v_path_booking <> NEW.booking_id
     OR v_path_document <> NEW.id THEN
    RAISE EXCEPTION 'Booking document path must be trip/booking/document';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_documents_sync_trip ON public.booking_documents;
CREATE TRIGGER booking_documents_sync_trip
  BEFORE INSERT OR UPDATE ON public.booking_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_booking_documents_sync_trip();

-- ---------------------------------------------------------------------------
-- Database-generated activity. No client INSERT on activities.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_booking_documents_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip uuid;
  v_type text;
  v_title text;
BEGIN
  IF current_setting('app.allow_owner_delete', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_trip := NEW.trip_id;
    v_type := 'booking.document.add';
    v_title := COALESCE(NEW.name, '');
  ELSE
    v_trip := OLD.trip_id;
    v_type := 'booking.document.delete';
    v_title := COALESCE(OLD.name, '');
  END IF;

  PERFORM public.log_activity(
    v_trip,
    v_type,
    jsonb_build_object('title', v_title)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS booking_documents_activity ON public.booking_documents;
CREATE TRIGGER booking_documents_activity
  AFTER INSERT OR DELETE ON public.booking_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_booking_documents_activity();

REVOKE ALL ON FUNCTION public.tg_booking_documents_activity() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Catalog cleanup when metadata is deleted (booking/trip cascade included).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_booking_documents_delete_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = OLD.storage_bucket
    AND name = OLD.storage_path;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS booking_documents_delete_object ON public.booking_documents;
CREATE TRIGGER booking_documents_delete_object
  AFTER DELETE ON public.booking_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_booking_documents_delete_object();

REVOKE ALL ON FUNCTION public.tg_booking_documents_delete_object() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Storage stub for local SQL tests. Hosted Supabase already has this schema.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS storage;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean NOT NULL DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  END IF;

  IF to_regclass('storage.objects') IS NULL THEN
    CREATE TABLE storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text NOT NULL REFERENCES storage.buckets (id),
      name text NOT NULL,
      owner uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (bucket_id, name)
    );
    -- Local SQL-test stub only. Hosted storage.objects is owned by
    -- supabase_storage_admin and already has RLS enabled.
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA storage TO authenticated';
    EXECUTE 'GRANT SELECT ON storage.buckets TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated';
  END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-docs',
  'booking-docs',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/plain']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  name = EXCLUDED.name;

DROP POLICY IF EXISTS booking_docs_select ON storage.objects;
CREATE POLICY booking_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'booking-docs'
    AND public.booking_doc_object_allowed(name, 'read')
  );

DROP POLICY IF EXISTS booking_docs_insert ON storage.objects;
CREATE POLICY booking_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'booking-docs'
    AND public.booking_doc_object_allowed(name, 'write')
  );

DROP POLICY IF EXISTS booking_docs_delete ON storage.objects;
CREATE POLICY booking_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'booking-docs'
    AND public.booking_doc_object_allowed(name, 'write')
  );

COMMENT ON TABLE public.booking_documents IS
  'Storage path metadata only. Bytes live in the private booking-docs bucket.';
