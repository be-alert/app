/*
  Be Alert — driving licence review for admins (PART 2 of 2, run after 20261011200000)
*/

-- ── 4. Queue (admin) ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_driver_queue();
CREATE FUNCTION public.admin_driver_queue()
RETURNS TABLE (user_id uuid, display_name text, licence_number text, licence_expiry date, requested_at timestamptz, docs text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
    SELECT p.id, COALESCE(NULLIF(p.display_name, ''), 'Unnamed user'), p.driver_licence_number, p.driver_licence_expiry,
           COALESCE(p.driver_requested_at, p.created_at), p.driver_docs
    FROM profiles p WHERE p.driver_status = 'pending'
    ORDER BY COALESCE(p.driver_requested_at, p.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_driver_queue() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_driver_queue() TO authenticated;

-- ── 5. Review / revoke (admin). Returns photo paths so the console deletes the files. ──
DROP FUNCTION IF EXISTS public.admin_review_driver(uuid, text, text);
CREATE FUNCTION public.admin_review_driver(p_user_id uuid, p_decision text, p_notes text DEFAULT '')
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p profiles; v_until timestamptz;
BEGIN
  PERFORM public.assert_admin();
  IF p_decision NOT IN ('approved', 'rejected', 'revoked') THEN RAISE EXCEPTION 'Decision must be approved, rejected or revoked'; END IF;
  SELECT * INTO p FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF p_decision = 'approved' AND (p.driver_licence_expiry IS NULL OR p.driver_licence_expiry <= current_date) THEN
    RAISE EXCEPTION 'This licence has expired or has no expiry date — reject it so they can re-submit';
  END IF;
  -- Valid until the licence expires (end of that day), at most one year.
  v_until := LEAST((p.driver_licence_expiry + 1)::timestamptz, now() + interval '1 year');

  UPDATE profiles SET
    driver_status         = CASE p_decision WHEN 'approved' THEN 'approved' ELSE 'rejected' END,
    driver_verified_until = CASE WHEN p_decision = 'approved' THEN v_until ELSE NULL END,
    driver_docs           = '{}'
  WHERE id = p_user_id;

  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_decision || '_driver', 'profile', p_user_id,
          jsonb_build_object('name', p.display_name, 'notes', p_notes,
                             'licence_masked', left(coalesce(p.driver_licence_number, ''), 3) || '•••' || right(coalesce(p.driver_licence_number, ''), 2),
                             'valid_until', CASE WHEN p_decision = 'approved' THEN v_until END,
                             'photos_deleted', cardinality(p.driver_docs) > 0));
  RETURN p.driver_docs;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_driver(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_driver(uuid, text, text) TO authenticated;

-- ── Result ──────────────────────────────────────────────────────────────────
SELECT
  '✅ BE ALERT DRIVER LICENCE OK' AS result,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name LIKE 'driver_%') AS driver_columns,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('submit_driver_verification', 'admin_driver_queue', 'admin_review_driver')) AS driver_functions,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'public_profiles' AND column_name = 'driver_verified') AS badge_ready;
