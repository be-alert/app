/*
  Be Alert — access-rule performance (2026-10-13)
  ================================================
  Same rules, evaluated once per query instead of once per row (Supabase advisor
  "auth_rls_initplan"): auth.uid() and our auth_is_* helpers are wrapped in a sub-select so
  Postgres caches the value. Who can see or change what is unchanged.
  Plus indexes on user_id foreign keys (faster "my votes/RSVPs" lookups and account deletion).
*/
DO $$
DECLARE
  r record;
  q text;
  c text;
  fix text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(auth\.uid\(\)|auth_is_admin\(\)|auth_is_banned\(\))'
  LOOP
    q := r.qual;
    c := r.with_check;
    -- Undo any existing wrapping first so we never double-wrap, then wrap every call once.
    FOREACH fix IN ARRAY ARRAY['auth.uid()', 'auth_is_admin()', 'auth_is_banned()'] LOOP
      q := replace(replace(q, '( SELECT ' || fix || ' AS uid)', fix), '(SELECT ' || fix || ')', fix);
      c := replace(replace(c, '( SELECT ' || fix || ' AS uid)', fix), '(SELECT ' || fix || ')', fix);
    END LOOP;
    q := replace(replace(replace(q, 'auth.uid()', '(SELECT auth.uid())'), 'auth_is_admin()', '(SELECT auth_is_admin())'), 'auth_is_banned()', '(SELECT auth_is_banned())');
    c := replace(replace(replace(c, 'auth.uid()', '(SELECT auth.uid())'), 'auth_is_admin()', '(SELECT auth_is_admin())'), 'auth_is_banned()', '(SELECT auth_is_banned())');
    IF q IS NOT NULL AND c IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, q, c);
    ELSIF q IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, q);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, c);
    END IF;
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_votes_user_id ON public.votes (user_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_user_id ON public.confirmations (user_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id ON public.event_rsvps (user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON public.poll_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_reposted_from_id ON public.posts (reposted_from_id) WHERE reposted_from_id IS NOT NULL;
