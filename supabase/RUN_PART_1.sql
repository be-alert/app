/*
  Be Alert — CNIC verification with photos (2026-10-11)
  ======================================================
  Safe to run more than once.

  Before: "verification" was a typed 13-digit number — nothing proved it was real or the
  user's own, and one number could verify many accounts.

  Now:
   • The user uploads a photo of the CNIC front and a selfie holding it to a PRIVATE bucket,
     inside their own folder only. Nobody else can list or open those files except
     owner/admins (through short-lived signed links).
   • submit_verification checks the number's format, that both photos really exist in the
     caller's folder, and that the CNIC isn't already used by another account.
   • Reviewing (approve or reject) clears the photo references and returns their paths so
     the console deletes the files at once. Only a masked number and the decision are kept.
*/

-- ── 1. Private bucket ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-docs', 'verification-docs', false, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "verification_docs_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "verification_docs_read" ON storage.objects;
DROP POLICY IF EXISTS "verification_docs_delete" ON storage.objects;

-- Upload only into your own folder ("<user id>/…"); suspended users can't upload.
CREATE POLICY "verification_docs_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND NOT public.auth_is_banned()
  );
-- Read: the owner (needed to delete their own files, e.g. on account deletion) and admins.
CREATE POLICY "verification_docs_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_admin())
  );
CREATE POLICY "verification_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_admin())
  );

-- ── 2. Where a pending request's photos are (not readable by users: no column grant) ──
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_docs text[] NOT NULL DEFAULT '{}';

-- ── 3. Submit (user) ────────────────────────────────────────────────────────
-- The old number-only version tells outdated apps to update instead of failing oddly.
CREATE OR REPLACE FUNCTION public.submit_verification(p_cnic text, p_is_business boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Please update Be Alert: verification now needs a photo of your CNIC and a selfie.';
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_verification(p_cnic text, p_is_business boolean, p_docs text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  p public.profiles;
  d text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF public.auth_is_banned() THEN RAISE EXCEPTION 'Suspended accounts can''t request verification' USING ERRCODE = '42501'; END IF;
  -- 13 digits; the first is the province code (1–7).
  IF p_cnic IS NULL OR p_cnic !~ '^[1-7][0-9]{12}$' THEN RAISE EXCEPTION 'Enter a valid 13-digit CNIC number'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF p.verification_status = 'pending' THEN RAISE EXCEPTION 'A verification request is already under review'; END IF;
  IF p.verification_status = 'approved' AND (p.verification_expiry IS NULL OR p.verification_expiry > now()) THEN
    RAISE EXCEPTION 'You are already verified';
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
    is_business               = COALESCE(p_is_business, false),
    verification_status       = 'pending',
    verification_requested_at = now(),
    verification_docs         = p_docs
  WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.submit_verification(text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.submit_verification(text, boolean, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verification(text, boolean, text[]) TO authenticated;


SELECT '✅ PART 1 OK — now run PART 2' AS result;
