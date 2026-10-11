-- Signed-out visitors don't need these helpers (no anon policy or view uses them);
-- is_user_banned(uuid) would otherwise let anyone probe whether an account is suspended.
REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
