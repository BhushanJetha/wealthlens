-- WealthLens 038: family sharing.
-- Each person has their own login and their own private data. An owner invites
-- a member; once the member agrees, the owner can READ the member's data. Never
-- the other way, and never write. Vault, saved bank details and AI chats are not
-- shared.
--
-- How it stays one-way:
--   • A link only becomes active through accept_family_invite(), run by the
--     member. Nobody can insert or update an active link directly.
--   • Reading a member's rows needs an active link AND the owner asking for that
--     member (header x-wl-view-as), so normal screens can't mix in anyone's data.
-- Run after 037. Safe to run more than once.

CREATE TABLE IF NOT EXISTS family_links (
  id           uuid default uuid_generate_v4() primary key,
  owner_id     uuid references profiles(id) on delete cascade not null,
  member_id    uuid references profiles(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 40),
  invite_code  text not null unique default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20),
  status       text not null default 'invited' check (status in ('invited', 'active', 'left')),
  expires_at   timestamptz not null default now() + interval '7 days',
  joined_at    timestamptz,
  left_at      timestamptz,
  created_at   timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_family_links_owner ON family_links(owner_id);
-- One family per member
CREATE UNIQUE INDEX IF NOT EXISTS uq_family_links_member ON family_links(member_id) WHERE status = 'active';

-- Is the signed-in person a member of someone's family? (A function, so the
-- policy below doesn't read its own table through RLS.)
CREATE OR REPLACE FUNCTION family_is_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM family_links WHERE member_id = auth.uid() AND status = 'active')
$$;
REVOKE ALL ON FUNCTION family_is_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION family_is_member() TO authenticated;

ALTER TABLE family_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS family_links_read ON family_links;
CREATE POLICY family_links_read ON family_links FOR SELECT
  USING (owner_id = auth.uid() OR member_id = auth.uid());
-- An owner can only create a blank invite, and a member can't invite anyone
DROP POLICY IF EXISTS family_links_invite ON family_links;
CREATE POLICY family_links_invite ON family_links FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND member_id IS NULL AND status = 'invited' AND joined_at IS NULL
    AND expires_at <= now() + interval '8 days' AND NOT family_is_member());
-- Cancel an invite, or clear a "left" notice. An active link only ends through the functions below.
DROP POLICY IF EXISTS family_links_clear ON family_links;
CREATE POLICY family_links_clear ON family_links FOR DELETE
  USING (owner_id = auth.uid() AND status <> 'active');
-- (No UPDATE policy: a link can't be edited directly.)

-- ── The member the owner is viewing right now (NULL = just your own data) ────
CREATE OR REPLACE FUNCTION family_view_target() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE raw text; target uuid;
BEGIN
  BEGIN
    raw := current_setting('request.headers', true)::json ->> 'x-wl-view-as';
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF raw IS NULL OR raw !~ '^[0-9a-fA-F-]{36}$' THEN RETURN NULL; END IF;
  SELECT member_id INTO target FROM family_links
    WHERE owner_id = auth.uid() AND member_id = raw::uuid AND status = 'active';
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION family_view_target() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION family_view_target() TO anon, authenticated;

-- ── Shared tables ────────────────────────────────────────────────────────────
-- Left out on purpose: vault_items, vault_meta, account_details (saved bank
-- details), chat_sessions, and profile and settings tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'transactions', 'txn_splits', 'friends', 'categories', 'budgets', 'budget_funds', 'recurring_txns', 'spend_events',
    'stocks', 'mutual_funds', 'etf_investments', 'fixed_deposits', 'recurring_deposits', 'nps_accounts', 'nps_contributions',
    'lic_policies', 'lic_payments', 'gold_investments', 'bond_investments', 'ppf_epf_accounts', 'other_assets', 'sip_payments',
    'investment_transactions', 'home_loans', 'loan_transactions', 'loan_payment_plan', 'insurance_policies',
    'goals', 'goal_investments', 'goal_contributions', 'net_worth_snapshots', 'family_members'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id') THEN
      EXECUTE format('DROP POLICY IF EXISTS family_view_read ON %I', t);
      EXECUTE format('CREATE POLICY family_view_read ON %I FOR SELECT USING (user_id = (SELECT family_view_target()))', t);
      -- While viewing a member, only that member's rows: never a mix with your own
      EXECUTE format('DROP POLICY IF EXISTS family_view_only ON %I', t);
      EXECUTE format('CREATE POLICY family_view_only ON %I AS RESTRICTIVE FOR SELECT USING ((SELECT family_view_target()) IS NULL OR user_id = (SELECT family_view_target()))', t);
    END IF;
  END LOOP;
END $$;

-- ── Joining and leaving ──────────────────────────────────────────────────────
-- What an invite says, before agreeing. state: valid · not_found · used ·
-- expired · own (your own invite) · in_family (already in one) · has_members
CREATE OR REPLACE FUNCTION family_invite_info(code text)
RETURNS TABLE (state text, owner_name text, member_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l family_links; who text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text; RETURN; END IF;
  SELECT * INTO l FROM family_links f WHERE f.invite_code = code;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text; RETURN; END IF;
  SELECT coalesce(nullif(split_part(trim(full_name), ' ', 1), ''), 'Someone') INTO who FROM profiles WHERE id = l.owner_id;
  RETURN QUERY SELECT
    CASE
      WHEN l.owner_id = auth.uid() THEN 'own'
      WHEN l.status <> 'invited' THEN 'used'
      WHEN l.expires_at < now() THEN 'expired'
      WHEN EXISTS (SELECT 1 FROM family_links x WHERE x.member_id = auth.uid() AND x.status = 'active') THEN 'in_family'
      WHEN EXISTS (SELECT 1 FROM family_links x WHERE x.owner_id = auth.uid() AND x.status = 'active') THEN 'has_members'
      ELSE 'valid'
    END, who, l.name;
END $$;

-- The member agrees. Refused for someone who already has members, so sharing
-- can't chain or become two-way.
CREATE OR REPLACE FUNCTION accept_family_invite(code text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; done uuid;
BEGIN
  SELECT i.state INTO s FROM family_invite_info(code) i;
  IF s IS DISTINCT FROM 'valid' THEN RETURN coalesce(s, 'not_found'); END IF;
  UPDATE family_links SET member_id = auth.uid(), status = 'active', joined_at = now()
    WHERE invite_code = code AND status = 'invited' AND expires_at >= now() AND owner_id <> auth.uid()
    RETURNING id INTO done;
  RETURN CASE WHEN done IS NULL THEN 'used' ELSE 'joined' END;
EXCEPTION WHEN unique_violation THEN
  RETURN 'in_family';
END $$;

-- The member leaves: access ends at once and the owner sees a notice
CREATE OR REPLACE FUNCTION leave_family() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE family_links SET status = 'left', left_at = now() WHERE member_id = auth.uid() AND status = 'active';
  RETURN FOUND;
END $$;

-- The owner removes a member: access ends at once; the member keeps everything
CREATE OR REPLACE FUNCTION remove_family_member(link uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM family_links WHERE id = link AND owner_id = auth.uid();
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION family_invite_info(text), accept_family_invite(text), leave_family(), remove_family_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION family_invite_info(text), accept_family_invite(text), leave_family(), remove_family_member(uuid) TO authenticated;
