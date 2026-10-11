/*
  Be Alert — driving licence required to offer rides (2026-10-11)
  =================================================================
  Safe to run more than once. Every Carpool & Rideshare post offers seats, so only drivers whose
  licence was checked by a moderator may post there (enforced in can_post_category, i.e. by the
  posts INSERT policy — a modified app can't skip it).

  The driver uploads a licence photo and a selfie holding it to the private verification-docs
  bucket (own folder only; see 20261011100000). The badge lasts until the licence expires, at
  most 1 year; photos are deleted once reviewed; one licence number can't serve two accounts.
*/

-- ── 1. Driver fields (licence number & photo paths are NOT readable by users) ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS driver_status          text CHECK (driver_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS driver_licence_number  text,
  ADD COLUMN IF NOT EXISTS driver_licence_expiry  date,
  ADD COLUMN IF NOT EXISTS driver_verified_until  timestamptz,
  ADD COLUMN IF NOT EXISTS driver_requested_at    timestamptz,
  ADD COLUMN IF NOT EXISTS driver_docs            text[] NOT NULL DEFAULT '{}';
GRANT SELECT (driver_status, driver_licence_expiry, driver_verified_until) ON public.profiles TO authenticated;

-- Riders see a "Verified driver" badge (a yes/no only).
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, display_name, avatar_url, is_business, verification_status, verification_expiry, trust_score,
       (driver_status = 'approved' AND driver_verified_until > now()) AS driver_verified
FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- ── 2. Submit (driver) ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_driver_verification(p_licence text, p_expiry date, p_docs text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE p public.profiles; lic text; d text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF public.auth_is_banned() THEN RAISE EXCEPTION 'Suspended accounts can''t offer rides' USING ERRCODE = '42501'; END IF;
  lic := upper(regexp_replace(coalesce(p_licence, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(lic) NOT BETWEEN 5 AND 20 THEN RAISE EXCEPTION 'Enter your driving licence number as printed on the card'; END IF;
  IF p_expiry IS NULL OR p_expiry <= current_date THEN RAISE EXCEPTION 'Your driving licence has expired — renew it first'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF p.driver_status = 'pending' THEN RAISE EXCEPTION 'Your licence is already under review'; END IF;
  IF p.driver_status = 'approved' AND p.driver_verified_until > now() THEN RAISE EXCEPTION 'You are already a verified driver'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles o WHERE o.id <> auth.uid() AND o.driver_licence_number = lic
             AND o.driver_status IN ('pending', 'approved')) THEN
    RAISE EXCEPTION 'This licence is already linked to another Be Alert account';
  END IF;

  IF p_docs IS NULL OR cardinality(p_docs) <> 2 THEN RAISE EXCEPTION 'Add a photo of your licence and a selfie holding it'; END IF;
  FOREACH d IN ARRAY p_docs LOOP
    IF split_part(d, '/', 1) <> auth.uid()::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'verification-docs' AND name = d) THEN
      RAISE EXCEPTION 'Photo upload not found — please add the photos again';
    END IF;
  END LOOP;

  UPDATE public.profiles SET
    driver_status = 'pending', driver_licence_number = lic, driver_licence_expiry = p_expiry,
    driver_requested_at = now(), driver_docs = p_docs
  WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.submit_driver_verification(text, date, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_driver_verification(text, date, text[]) TO authenticated;

-- ── 3. Only verified drivers may post rides ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_post_category(p_category text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.auth_is_admin() OR (
    s.posting_enabled
    AND NOT (p_category = ANY (s.disabled_categories))
    AND (
      NOT (p_category = ANY (s.verified_only_categories))
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.verification_status = 'approved'
          AND (p.verification_expiry IS NULL OR p.verification_expiry > now())
      )
    )
    AND (
      p_category <> 'ride_share'
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.driver_status = 'approved' AND p.driver_verified_until > now()
      )
    )
  )
  FROM app_settings s WHERE s.id = 1;
$$;
REVOKE ALL ON FUNCTION public.can_post_category(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_post_category(text) TO authenticated;

SELECT '✅ PART 1 OK — now run PART 2' AS result;
