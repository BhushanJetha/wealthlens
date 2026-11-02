-- WealthLens 039: a member's net worth includes their UAE gratuity, which is kept
-- on investor_profile, so an owner viewing them needs to read that row too (same
-- rule as migration 038: read only, active link, and only when asked).
-- Run after 038. Safe to run more than once.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'investor_profile' AND column_name = 'user_id') THEN
    DROP POLICY IF EXISTS family_view_read ON investor_profile;
    CREATE POLICY family_view_read ON investor_profile FOR SELECT USING (user_id = (SELECT family_view_target()));
    DROP POLICY IF EXISTS family_view_only ON investor_profile;
    CREATE POLICY family_view_only ON investor_profile AS RESTRICTIVE FOR SELECT USING ((SELECT family_view_target()) IS NULL OR user_id = (SELECT family_view_target()));
  END IF;
END $$;
