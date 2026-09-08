-- Maps a Campaign Commander user to their Odoo user, so leads pushed to
-- Odoo get assigned to the right salesperson instead of landing
-- unassigned (which also made them invisible under "My Pipeline" there).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS odoo_user_id TEXT;

-- Deal outcome, mirrored from Odoo alongside the existing odoo_stage
-- (see 0012) so per-salesperson revenue/win-rate can be reported here.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_won BOOLEAN;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_expected_revenue NUMERIC;
