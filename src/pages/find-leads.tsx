import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Coins, Search } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LushaSearch } from "@/components/lusha/lusha-search";
import { DEFAULT_LUSHA_FILTERS, type LushaFilters } from "@/lib/lusha";
import { saveFoundLeads, type LeadDraft } from "@/lib/leads";

/**
 * Lusha search on its own, outside any campaign.
 *
 * Same filters as the campaign wizard's Search step — by person, company,
 * department, job title, seniority, location, size, revenue, tech — but
 * what comes back is saved to the Leads list with no campaign attached.
 * Starting a campaign from those leads happens later, from the Leads
 * page.
 */
export default function FindLeadsPage() {
  const { organization, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<LushaFilters>(DEFAULT_LUSHA_FILTERS);

  const handleSave = async (leads: LeadDraft[]) => {
    if (!organization?.id || !profile?.id) {
      toast.error("Missing workspace — sign in again");
      return;
    }
    const { saved, skipped } = await saveFoundLeads({
      orgId: organization.id,
      userId: profile.id,
      userLabel: profile.full_name ?? profile.email ?? undefined,
      leads,
    });
    if (saved === 0) {
      toast.info("Those leads are all in your list already");
      return;
    }
    toast.success(
      `${saved} lead${saved === 1 ? "" : "s"} saved to your leads${
        skipped > 0 ? ` · ${skipped} already there` : ""
      }`,
    );
    qc.invalidateQueries({ queryKey: ["all-leads", organization.id] });
    navigate("/leads");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Search className="h-5 w-5 text-primary" />
            Find leads
          </h2>
          <p className="text-sm text-muted-foreground">
            Search Lusha and save what you find. No campaign needed — start
            one from the Leads page whenever you're ready.
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/leads")}>
          <ArrowLeft className="h-4 w-4" /> Back to leads
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-muted-foreground">
          Searching is free. Saving reveals each lead's email and phone,
          which <strong className="text-foreground">spends one Lusha credit
          per lead</strong>, and verifies the address so it's ready to send
          to. Leads you already have are skipped, not charged twice.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who are you looking for?</CardTitle>
        </CardHeader>
        <CardContent>
          <LushaSearch
            filters={filters}
            setFilters={(updater) => setFilters((f) => updater(f))}
            actionLabel="Reveal & save"
            onLeads={handleSave}
          />
        </CardContent>
      </Card>
    </div>
  );
}
