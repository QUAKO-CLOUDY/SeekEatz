-- Harden waitlist writes so public clients use the API route instead of calling
-- the RPC directly. The server route uses the service role key and can still
-- execute this function.

REVOKE EXECUTE ON FUNCTION public.join_waitlist(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_waitlist(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.join_waitlist(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(TEXT) TO service_role;
