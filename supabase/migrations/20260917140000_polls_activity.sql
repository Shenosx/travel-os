-- Phase 5C-8: poll vote/option integrity, atomic poll create, activity audit.
--
-- Vote option must belong to the same poll. UNIQUE (poll_id, user_id) already
-- exists as the poll_votes primary key. tg_poll_votes_guard already rejects
-- mismatched options; the composite FK makes that declarative.
-- MATCH SIMPLE is unused here because both columns are NOT NULL.
-- Original option_id ON DELETE CASCADE stays so deleting a poll still
-- removes its options and votes.
--
-- create_poll is SECURITY INVOKER so RLS still applies. It exists so poll
-- header + options commit together.
--
-- Activity triggers are SECURITY DEFINER with search_path = public because
-- authenticated clients have SELECT/DELETE on activities, not INSERT.
-- They reuse public.log_activity. Expenses are not logged here; save_expense
-- and delete_expense already write activity.

CREATE UNIQUE INDEX IF NOT EXISTS poll_options_id_poll_id_uidx
  ON public.poll_options (id, poll_id);

ALTER TABLE public.poll_votes
  DROP CONSTRAINT IF EXISTS poll_votes_option_poll_fkey;

ALTER TABLE public.poll_votes
  ADD CONSTRAINT poll_votes_option_poll_fkey
  FOREIGN KEY (option_id, poll_id)
  REFERENCES public.poll_options (id, poll_id)
  ON UPDATE RESTRICT
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT poll_votes_option_poll_fkey ON public.poll_votes IS
  'A vote option must belong to the same poll.';

CREATE OR REPLACE FUNCTION public.tg_poll_options_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.poll_id IS DISTINCT FROM OLD.poll_id THEN
    RAISE EXCEPTION 'Poll option cannot move to another poll';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS poll_options_guard ON public.poll_options;
CREATE TRIGGER poll_options_guard
  BEFORE UPDATE OF poll_id ON public.poll_options
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_poll_options_guard();

CREATE OR REPLACE FUNCTION public.create_poll(p_trip_id uuid, p_question text, p_options text[])
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_label text;
  v_order integer := 0;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF p_question IS NULL OR btrim(p_question) = '' THEN
    RAISE EXCEPTION 'Add a question';
  END IF;

  IF p_options IS NULL THEN
    RAISE EXCEPTION 'Add at least two options';
  END IF;

  FOREACH v_label IN ARRAY p_options
  LOOP
    IF v_label IS NOT NULL AND btrim(v_label) <> '' THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Add at least two options';
  END IF;

  INSERT INTO public.polls (trip_id, question)
  VALUES (p_trip_id, btrim(p_question))
  RETURNING id INTO v_id;

  FOREACH v_label IN ARRAY p_options
  LOOP
    IF v_label IS NULL OR btrim(v_label) = '' THEN
      CONTINUE;
    END IF;
    INSERT INTO public.poll_options (poll_id, label, sort_order)
    VALUES (v_id, btrim(v_label), v_order);
    v_order := v_order + 1;
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_poll(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_poll(uuid, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_log_row_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip uuid;
  v_type text;
  v_title text := '';
  v_question text := '';
BEGIN
  IF current_setting('app.allow_owner_delete', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'places' THEN
    v_trip := COALESCE(NEW.trip_id, OLD.trip_id);
    v_title := COALESCE(NEW.name, OLD.name, '');
    v_type := CASE TG_OP
      WHEN 'INSERT' THEN 'place.add'
      WHEN 'UPDATE' THEN 'place.update'
      ELSE 'place.delete'
    END;
  ELSIF TG_TABLE_NAME = 'bookings' THEN
    v_trip := COALESCE(NEW.trip_id, OLD.trip_id);
    v_title := COALESCE(NEW.title, OLD.title, '');
    v_type := CASE TG_OP
      WHEN 'INSERT' THEN 'booking.add'
      WHEN 'UPDATE' THEN 'booking.update'
      ELSE 'booking.delete'
    END;
  ELSIF TG_TABLE_NAME = 'itinerary_items' THEN
    IF TG_OP = 'UPDATE'
       AND NEW.title IS NOT DISTINCT FROM OLD.title
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.category IS NOT DISTINCT FROM OLD.category
       AND NEW.time IS NOT DISTINCT FROM OLD.time
    THEN
      RETURN NEW;
    END IF;
    v_trip := COALESCE(NEW.trip_id, OLD.trip_id);
    v_title := COALESCE(NEW.title, OLD.title, '');
    v_type := CASE TG_OP
      WHEN 'INSERT' THEN 'itinerary.add'
      WHEN 'UPDATE' THEN 'itinerary.update'
      ELSE 'itinerary.delete'
    END;
  ELSIF TG_TABLE_NAME = 'polls' THEN
    v_trip := COALESCE(NEW.trip_id, OLD.trip_id);
    v_title := COALESCE(NEW.question, OLD.question, '');
    v_type := CASE TG_OP
      WHEN 'INSERT' THEN 'poll.add'
      WHEN 'UPDATE' THEN 'poll.update'
      ELSE 'poll.delete'
    END;
  ELSIF TG_TABLE_NAME = 'poll_votes' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    SELECT p.trip_id, p.question, o.label
    INTO v_trip, v_question, v_title
    FROM public.polls p
    JOIN public.poll_options o ON o.id = NEW.option_id
    WHERE p.id = NEW.poll_id;
    IF v_trip IS NULL THEN
      RETURN NEW;
    END IF;
    v_type := 'poll.vote';
    PERFORM public.log_activity(
      v_trip,
      v_type,
      jsonb_build_object('title', COALESCE(v_title, ''), 'question', COALESCE(v_question, ''))
    );
    RETURN NEW;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.log_activity(
    v_trip,
    v_type,
    jsonb_build_object('title', COALESCE(v_title, ''))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS places_activity ON public.places;
CREATE TRIGGER places_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.places
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_log_row_activity();

DROP TRIGGER IF EXISTS bookings_activity ON public.bookings;
CREATE TRIGGER bookings_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_log_row_activity();

DROP TRIGGER IF EXISTS itinerary_items_activity ON public.itinerary_items;
CREATE TRIGGER itinerary_items_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.itinerary_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_log_row_activity();

DROP TRIGGER IF EXISTS polls_activity ON public.polls;
CREATE TRIGGER polls_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.polls
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_log_row_activity();

DROP TRIGGER IF EXISTS poll_votes_activity ON public.poll_votes;
CREATE TRIGGER poll_votes_activity
  AFTER INSERT OR UPDATE ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_log_row_activity();
