-- Remove the blanket org-wide policies that were overruling every later
-- privacy rule.
--
-- 0002 gives campaigns, leads and friends a "<table>_org_all" policy:
-- anything in your org. 0010 replaced those for campaigns and leads with
-- per-creator rules, and 0017/0020/0028 did the same for settings,
-- sender_accounts, webhook_logs, imports and invitations.
--
-- But policies are OR-ed: re-running 0002 after those migrations (the
-- README literally said to run every file in order) recreated
-- campaigns_org_all and leads_org_all, and once present they grant every
-- member access to every campaign and every lead in the org — the
-- scoped policy beside them can never take anything away.
--
-- That is why members could still read each other's leads and replies
-- after 0028: 0028 was correct, and simply outvoted.
--
-- Dropping them restores the intended rule: a member sees their own
-- campaigns and leads, owner/admin see all.
DROP POLICY IF EXISTS "campaigns_org_all" ON public.campaigns;
DROP POLICY IF EXISTS "leads_org_all" ON public.leads;

-- The same blanket policies for everything else later migrations scoped,
-- dropped defensively in case an earlier re-run brought them back too.
DROP POLICY IF EXISTS "settings_org_all" ON public.settings;
DROP POLICY IF EXISTS "sender_accounts_org_all" ON public.sender_accounts;
DROP POLICY IF EXISTS "webhook_logs_org_all" ON public.webhook_logs;
DROP POLICY IF EXISTS "imports_org_all" ON public.imports;
DROP POLICY IF EXISTS "invitations_org_all" ON public.invitations;
DROP POLICY IF EXISTS "users_update_self_or_org" ON public.users;

-- Note: sequences_org_all stays. It is the only policy on sequences, and
-- it scopes through the parent campaign — a subquery that is itself
-- filtered by campaigns' own policy — so it inherits the right
-- visibility rather than bypassing it.
