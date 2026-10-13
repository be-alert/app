/*
  Be Alert — CNIC number check against the card photo (2026-10-13)
  =================================================================
  The app reads the number printed on the CNIC photo on the user's own device (OCR) and sends
  what it read. The server — not the app — compares it with the typed number:
    • same number             → 'match'      (pending review, shown green to moderators)
    • 1–2 digits differ       → 'near'       (pending review, flagged: check carefully)
    • nothing readable        → 'unreadable' (pending review, flagged: compare by eye)
    • 3+ digits differ        → 'mismatch'   → REJECTED AUTOMATICALLY, reason recorded
  3 rejected attempts within 24 hours block new requests for 24 hours.
  What was read is visible only to moderators (no column grant) and is cleared at review.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_ocr jsonb;
REVOKE ALL (verification_ocr) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cnic_digit_diff(a text, b text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(a) <> length(b) THEN greatest(length(a), length(b))
              ELSE (SELECT count(*)::int FROM generate_series(1, length(a)) i WHERE substr(a, i, 1) <> substr(b, i, 1)) END;
$$;
REVOKE ALL ON FUNCTION public.cnic_digit_diff(text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_verification(p_cnic text, p_is_business boolean, p_docs text[], p_read text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage, pg_temp AS $$
DECLARE
  p public.profiles;
  d text;
  v_check text;
  v_diff int;
  v_masked text;
  v_recent int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF public.auth_is_banned() THEN RAISE EXCEPTION 'Suspended accounts can''t request verification' USING ERRCODE = '42501'; END IF;
  IF p_cnic IS NULL OR p_cnic !~ '^[1-7][0-9]{12}$' THEN RAISE EXCEPTION 'Enter a valid 13-digit CNIC number'; END IF;
  IF p_read IS NOT NULL AND p_read !~ '^[0-9]{13}$' THEN RAISE EXCEPTION 'Invalid photo check — please try again'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF p.verification_status = 'pending' THEN RAISE EXCEPTION 'A verification request is already under review'; END IF;
  IF p.verification_status = 'approved' AND (p.verification_expiry IS NULL OR p.verification_expiry > now()) THEN
    RAISE EXCEPTION 'You are already verified';
  END IF;

  SELECT count(*) INTO v_recent
  FROM jsonb_array_elements(coalesce(p.verification_history, '[]'::jsonb)) h
  WHERE h->>'status' = 'rejected' AND (h->>'date')::timestamptz > now() - interval '24 hours';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Too many rejected attempts. Please wait 24 hours and make sure you use your own CNIC.' USING ERRCODE = '54000';
  END IF;

  v_diff := CASE WHEN p_read IS NULL THEN NULL ELSE public.cnic_digit_diff(p_read, p_cnic) END;
  v_check := CASE WHEN p_read IS NULL THEN 'unreadable' WHEN v_diff = 0 THEN 'match' WHEN v_diff <= 2 THEN 'near' ELSE 'mismatch' END;
  v_masked := substr(p_cnic, 1, 5) || '-•••••••-' || substr(p_cnic, 13, 1);

  IF v_check = 'mismatch' THEN
    UPDATE public.profiles SET
      verification_status  = 'rejected',
      verification_date    = now(),
      verification_ocr     = NULL,
      verification_history = jsonb_build_array(jsonb_build_object(
                               'id', gen_random_uuid(), 'date', now(), 'cnic_masked', v_masked, 'status', 'rejected',
                               'notes', 'The CNIC number you typed does not match the number on your card photo (automatic check)',
                               'automatic', true, 'photo_check', 'mismatch')) || coalesce(verification_history, '[]'::jsonb)
    WHERE id = auth.uid();
    RETURN 'auto_rejected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles o
    WHERE o.id <> auth.uid() AND o.cnic_number = p_cnic AND o.verification_status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'This CNIC is already linked to another Be Alert account';
  END IF;

  IF p_docs IS NULL OR cardinality(p_docs) <> 2 THEN
    RAISE EXCEPTION 'Add a photo of your CNIC and a selfie holding it';
  END IF;
  FOREACH d IN ARRAY p_docs LOOP
    IF split_part(d, '/', 1) <> auth.uid()::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'verification-docs' AND name = d) THEN
      RAISE EXCEPTION 'Photo upload not found — please add the photos again';
    END IF;
  END LOOP;

  UPDATE public.profiles SET
    cnic_number               = p_cnic,
    is_business               = coalesce(p_is_business, false),
    verification_status       = 'pending',
    verification_requested_at = now(),
    verification_docs         = p_docs,
    verification_ocr          = jsonb_build_object('check', v_check, 'read', p_read, 'diff', v_diff, 'at', now())
  WHERE id = auth.uid();
  RETURN 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_verification(text, boolean, text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification(text, boolean, text[], text) TO authenticated;

-- Older app versions (no photo check) must update.
CREATE OR REPLACE FUNCTION public.submit_verification(p_cnic text, p_is_business boolean, p_docs text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Please update Be Alert to the latest version to verify your CNIC';
END;
$$;

-- Moderator queue: include the photo check.
DROP FUNCTION IF EXISTS public.admin_verification_queue();
CREATE FUNCTION public.admin_verification_queue()
RETURNS TABLE(user_id uuid, display_name text, phone text, cnic_number text, is_business boolean, trust_score integer,
              requested_at timestamptz, docs text[], photo_check jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
    SELECT p.id, coalesce(nullif(p.display_name, ''), 'Unnamed user'), p.phone, p.cnic_number, p.is_business, p.trust_score,
           coalesce(p.verification_requested_at, p.created_at), p.verification_docs, p.verification_ocr
    FROM profiles p
    WHERE p.verification_status = 'pending'
    ORDER BY coalesce(p.verification_requested_at, p.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_verification_queue() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_verification_queue() TO authenticated;

-- Review: keep only the result of the photo check in the history; forget what was read.
CREATE OR REPLACE FUNCTION public.admin_review_verification(p_user_id uuid, p_decision text, p_notes text DEFAULT '', p_expiry timestamptz DEFAULT NULL)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p profiles; masked text;
BEGIN
  PERFORM public.assert_admin();
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;
  SELECT * INTO p FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  masked := CASE WHEN p.cnic_number ~ '^[0-9]{13}$' THEN substr(p.cnic_number, 1, 5) || '-•••••••-' || substr(p.cnic_number, 13, 1) ELSE '—' END;

  UPDATE profiles SET
    verification_status  = p_decision,
    verification_date    = now(),
    verification_expiry  = CASE WHEN p_decision = 'approved' THEN coalesce(p_expiry, now() + interval '1 year') ELSE NULL END,
    trust_score          = CASE WHEN p_decision = 'approved' AND p.verification_status IS DISTINCT FROM 'approved'
                                THEN least(100, trust_score + 15) ELSE trust_score END,
    verification_docs    = '{}',
    verification_ocr     = NULL,
    verification_history = jsonb_build_array(jsonb_build_object(
                             'id', gen_random_uuid(), 'date', now(), 'cnic_masked', masked, 'status', p_decision,
                             'valid_until', CASE WHEN p_decision = 'approved' THEN coalesce(p_expiry, now() + interval '1 year') END,
                             'notes', coalesce(p_notes, ''), 'photos_checked', cardinality(p.verification_docs) > 0,
                             'photo_check', p.verification_ocr->>'check')) || coalesce(verification_history, '[]'::jsonb)
  WHERE id = p_user_id;

  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), CASE WHEN p_decision = 'approved' THEN 'approve_verification' ELSE 'reject_verification' END,
          'profile', p_user_id,
          jsonb_build_object('name', p.display_name, 'notes', p_notes, 'valid_until', p_expiry,
                             'photo_check', p.verification_ocr->>'check',
                             'photos_checked', cardinality(p.verification_docs) > 0, 'photos_deleted', true));

  RETURN p.verification_docs;
END;
$$;
