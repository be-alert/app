-- Be Alert — CNIC photo verification, PART 2 of 2 (run after PART 1)
-- ── 4. Review queue (admin) now includes the photo paths ────────────────────
DROP FUNCTION IF EXISTS public.admin_verification_queue();
CREATE FUNCTION public.admin_verification_queue()
RETURNS TABLE (user_id uuid, display_name text, phone text, cnic_number text, is_business boolean, trust_score int, requested_at timestamptz, docs text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
    SELECT p.id, COALESCE(NULLIF(p.display_name, ''), 'Unnamed user'), p.phone, p.cnic_number, p.is_business, p.trust_score,
           COALESCE(p.verification_requested_at, p.created_at), p.verification_docs
    FROM profiles p
    WHERE p.verification_status = 'pending'
    ORDER BY COALESCE(p.verification_requested_at, p.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_verification_queue() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_verification_queue() TO authenticated;

-- ── 5. Review (admin): returns the photo paths so the console deletes the files ──
DROP FUNCTION IF EXISTS public.admin_review_verification(uuid, text, text, timestamptz);
CREATE FUNCTION public.admin_review_verification(p_user_id uuid, p_decision text, p_notes text DEFAULT '', p_expiry timestamptz DEFAULT NULL)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    verification_expiry  = CASE WHEN p_decision = 'approved' THEN COALESCE(p_expiry, now() + interval '1 year') ELSE NULL END,
    trust_score          = CASE WHEN p_decision = 'approved' AND p.verification_status IS DISTINCT FROM 'approved'
                                THEN LEAST(100, trust_score + 15) ELSE trust_score END,
    verification_docs    = '{}',
    verification_history = jsonb_build_array(jsonb_build_object(
                             'id', gen_random_uuid(), 'date', now(), 'cnic_masked', masked, 'status', p_decision,
                             'valid_until', CASE WHEN p_decision = 'approved' THEN COALESCE(p_expiry, now() + interval '1 year') END,
                             'notes', COALESCE(p_notes, ''), 'photos_checked', cardinality(p.verification_docs) > 0)) || COALESCE(verification_history, '[]'::jsonb)
  WHERE id = p_user_id;

  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), CASE WHEN p_decision = 'approved' THEN 'approve_verification' ELSE 'reject_verification' END,
          'profile', p_user_id,
          jsonb_build_object('name', p.display_name, 'notes', p_notes, 'valid_until', p_expiry,
                             'photos_checked', cardinality(p.verification_docs) > 0, 'photos_deleted', true));

  RETURN p.verification_docs;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_verification(uuid, text, text, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, text, text, timestamptz) TO authenticated;

-- ── 6. Providers must be verified to post (regular users never need a CNIC) ──
-- Service providers, tutors, domestic help, rentals, job ads and shop deals. The owner can
-- change this list any time in Owner Console → App settings. Enforced by can_post_category()
-- in the posts INSERT policy, so a modified app can't skip it.
UPDATE public.app_settings
   SET verified_only_categories = ARRAY['home_services', 'tuition', 'domestic_help', 'property_rent', 'jobs_internships', 'local_deals']
 WHERE id = 1;

-- ── Result ──────────────────────────────────────────────────────────────────
SELECT
  '✅ BE ALERT CNIC PHOTOS OK' AS result,
  (SELECT public FROM storage.buckets WHERE id = 'verification-docs') AS bucket_is_public,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'verification_docs_%') AS storage_policies,
  (SELECT count(*) FROM pg_proc WHERE proname = 'submit_verification') AS submit_versions,
  (SELECT cardinality(verified_only_categories) FROM public.app_settings WHERE id = 1) AS provider_categories;
