-- Hotfix: signup was failing with "Database error saving new user" because
-- handle_new_user() inserted into user_funnel_events during auth signup, when
-- auth.uid() is null and RLS blocked the insert (rolling back the new user).
--
-- Restore profile-only trigger; account_created funnel is recorded in bootstrap API.
-- Use id, email, updated_at only — production profiles has no created_at column.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, updated_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure signup trigger still exists (no-op if already present).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
