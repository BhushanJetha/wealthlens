-- ================================================================
-- 018: Fix "Database error saving new user" on signup
-- ----------------------------------------------------------------
-- The auth signup creates a row in auth.users, which fires
-- handle_new_user() to create the matching public.profiles row.
-- If that insert throws for ANY reason, Supabase Auth aborts the
-- whole signup with "Database error saving new user" — breaking
-- both email and Google sign-up.
--
-- This rewrite makes the trigger bulletproof:
--   * SECURITY DEFINER + SET search_path = public  (always resolves
--     and writes public.profiles, bypassing RLS as the table owner)
--   * schema-qualified insert
--   * EXCEPTION handler so a profile-insert failure NEVER blocks
--     signup — the app upserts the profile on first dashboard load
--     anyway (see app/dashboard/layout.tsx).
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', ''),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the auth signup if the profile row can't be created.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Belt-and-suspenders: allow the row-owner insert path used by the
-- app's fallback upsert (RLS already had this; re-assert it).
DROP POLICY IF EXISTS "profile_insert" ON public.profiles;
CREATE POLICY "profile_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
