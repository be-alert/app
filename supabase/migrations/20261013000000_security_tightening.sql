/*
  Be Alert — security tightening (2026-10-13 audit)
  =================================================
  • Polls: users can no longer write vote_count (they could create options with fake
    totals), and options can't be added once people have voted.
  • Business listings: users may only set the business fields; admin-only fields
    (status after review, admin_notes, reviewed_by/at, timestamps, id) are server-side.
  • Profiles: "Business / service provider" (is_business) is set only through CNIC
    verification, not by a direct profile edit.
  • Votes / RSVPs: an update can't move a row to another post or another user.
  • is_user_banned(any user) is no longer callable from the API (it revealed whether
    another person is suspended); the app never calls it.
*/

-- Polls
REVOKE INSERT, UPDATE ON public.poll_options FROM anon, authenticated;
GRANT INSERT (post_id, option_text) ON public.poll_options TO authenticated;

DROP POLICY IF EXISTS "insert_own_poll_options" ON public.poll_options;
CREATE POLICY "insert_own_poll_options" ON public.poll_options FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts WHERE posts.id = poll_options.post_id AND posts.user_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.post_id = poll_options.post_id)
  );

-- Business listings
REVOKE INSERT, UPDATE ON public.provider_listings FROM anon, authenticated;
GRANT INSERT (user_id, business_name, category, description, phone, lat, lng, location_label, status)
  ON public.provider_listings TO authenticated;
GRANT UPDATE (business_name, category, description, phone, lat, lng, location_label)
  ON public.provider_listings TO authenticated;

-- Profiles: business flag comes from verification only
REVOKE UPDATE (is_business) ON public.profiles FROM anon, authenticated;

-- Votes / RSVPs: keep the row on the same post and user
CREATE OR REPLACE FUNCTION public.lock_row_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.post_id IS DISTINCT FROM OLD.post_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'This change is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_row_identity() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS votes_lock_identity ON public.votes;
CREATE TRIGGER votes_lock_identity BEFORE UPDATE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.lock_row_identity();
DROP TRIGGER IF EXISTS event_rsvps_lock_identity ON public.event_rsvps;
CREATE TRIGGER event_rsvps_lock_identity BEFORE UPDATE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.lock_row_identity();

-- Ban status of other users is not public
REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM public, anon, authenticated;
