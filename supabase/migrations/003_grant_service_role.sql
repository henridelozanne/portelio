-- Grant table-level access to service_role (bypasses RLS but still needs GRANT)
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.pairs TO service_role;
GRANT ALL ON public.invitations TO service_role;
GRANT ALL ON public.photos TO service_role;
