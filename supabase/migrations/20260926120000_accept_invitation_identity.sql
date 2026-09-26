-- accept_invitation must resolve the invitee's email from the signed-in user,
-- not only auth.email(). Some hosted JWTs omit the email claim; auth.uid()
-- remains the authorization identity.

CREATE OR REPLACE FUNCTION public.accept_invitation(p_raw_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_raw bytea;
  v_hash text;
  v_invite public.trip_invitations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT lower(btrim(COALESCE(
    NULLIF(auth.email(), ''),
    (SELECT p.email FROM public.profiles p WHERE p.id = v_actor),
    (SELECT u.email FROM auth.users u WHERE u.id = v_actor),
    ''
  )))
  INTO v_email;

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

COMMENT ON FUNCTION public.accept_invitation(text) IS
  'Invitee-only. Role comes from the stored invitation. Email is resolved from JWT, then profiles, then auth.users.';
