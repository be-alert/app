/*
  Be Alert — business listings & review feedback (2026-10-11)
  =============================================================
  • A business listing can only be approved when its owner's CNIC is verified, and the public
    directory only shows listings whose owner is still verified (revoked/expired → hidden).
  • Admins can take an approved listing off the directory ("removed" → rejected with a note).
  • Users see why a driving licence was rejected (driver_review_notes); CNIC reasons are
    already in verification_history.
  • Dashboard counts include pending driving licences.
*/

-- Owner of a listing is CNIC-verified right now (usable by visitors' read policy).
CREATE OR REPLACE FUNCTION public.is_verified_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user_id AND p.verification_status = 'approved'
      AND (p.verification_expiry IS NULL OR p.verification_expiry > now()) AND NOT coalesce(p.is_banned, false)
  );
$$;
REVOKE ALL ON FUNCTION public.is_verified_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_verified_user(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "public_can_see_approved_listings" ON public.provider_listings;
CREATE POLICY "public_can_see_approved_listings" ON public.provider_listings FOR SELECT TO anon, authenticated
  USING (status = 'approved' AND public.is_verified_user(user_id));

CREATE OR REPLACE FUNCTION public.admin_review_listing(p_listing_id uuid, p_decision text, p_notes text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l provider_listings;
BEGIN
  PERFORM public.assert_admin();
  IF p_decision NOT IN ('approved', 'rejected', 'removed') THEN RAISE EXCEPTION 'Decision must be approved, rejected or removed'; END IF;
  SELECT * INTO l FROM provider_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF p_decision = 'approved' AND NOT public.is_verified_user(l.user_id) THEN
    RAISE EXCEPTION 'The owner hasn''t verified their CNIC yet — verify them first (Verification tab), then approve';
  END IF;
  UPDATE provider_listings SET
    status = CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'rejected' END,
    admin_notes = NULLIF(p_notes, ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_listing_id;
  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_decision || '_listing', 'listing', p_listing_id, jsonb_build_object('business', l.business_name, 'notes', p_notes));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_listing(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_listing(uuid, text, text) TO authenticated;

-- Why a licence was rejected/revoked, shown to that driver only.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS driver_review_notes text;
GRANT SELECT (driver_review_notes) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_driver(p_user_id uuid, p_decision text, p_notes text DEFAULT '')
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p profiles; v_until timestamptz;
BEGIN
  PERFORM public.assert_admin();
  IF p_decision NOT IN ('approved', 'rejected', 'revoked') THEN RAISE EXCEPTION 'Decision must be approved, rejected or revoked'; END IF;
  SELECT * INTO p FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF p_decision = 'approved' AND (p.driver_licence_expiry IS NULL OR p.driver_licence_expiry <= current_date) THEN
    RAISE EXCEPTION 'This licence has expired or has no expiry date — reject it so they can re-submit';
  END IF;
  v_until := LEAST((p.driver_licence_expiry + 1)::timestamptz, now() + interval '1 year');
  UPDATE profiles SET
    driver_status         = CASE p_decision WHEN 'approved' THEN 'approved' ELSE 'rejected' END,
    driver_verified_until = CASE WHEN p_decision = 'approved' THEN v_until ELSE NULL END,
    driver_review_notes   = CASE WHEN p_decision = 'approved' THEN NULL ELSE NULLIF(p_notes, '') END,
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

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_admin();
  SELECT jsonb_build_object(
    'totalPosts',           (SELECT count(*) FROM posts),
    'activePosts',          (SELECT count(*) FROM posts WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())),
    'hiddenPosts',          (SELECT count(*) FROM posts WHERE status = 'hidden'),
    'reportedPosts',        (SELECT count(*) FROM posts WHERE report_count > 0 AND status <> 'hidden'),
    'totalUsers',           (SELECT count(*) FROM profiles),
    'suspendedUsers',       (SELECT count(*) FROM profiles WHERE is_banned),
    'pendingVerifications', (SELECT count(*) FROM profiles WHERE verification_status = 'pending'),
    'pendingDrivers',       (SELECT count(*) FROM profiles WHERE driver_status = 'pending'),
    'pendingListings',      (SELECT count(*) FROM provider_listings WHERE status = 'pending'),
    'postsByDay', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'count', COALESCE(c.n, 0)) ORDER BY d), '[]'::jsonb)
      FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
      LEFT JOIN (SELECT date_trunc('day', created_at) AS day, count(*) AS n FROM posts GROUP BY 1) c ON c.day = d
    ),
    'postsByCategory', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'count', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT category, count(*) AS n FROM posts GROUP BY category) x
    )
  ) INTO result;
  RETURN result;
END;
$$;
