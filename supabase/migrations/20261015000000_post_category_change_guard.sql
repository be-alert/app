-- Moving one of your posts into another section needs the same permission as posting there.
-- Without this, an unverified user could post in an open section (e.g. Lost & Found) and then
-- edit the post's category to Buy & Sell or services, skipping CNIC approval.
CREATE OR REPLACE FUNCTION public.guard_post_category_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT public.auth_is_admin()
     AND NEW.category IS DISTINCT FROM OLD.category
     AND NOT public.can_post_category(NEW.category) THEN
    RAISE EXCEPTION 'You need an approved verification to post in this section' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_guard_category ON public.posts;
CREATE TRIGGER posts_guard_category
  BEFORE UPDATE OF category ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_post_category_change();
