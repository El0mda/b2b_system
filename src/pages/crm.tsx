import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Eye,
  MousePointerClick,
  MessageSquare,
  X,
  Briefcase,
  Building2,
  MapPin,
  Phone,
  Globe,
  Linkedin,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Trophy,
  XCircle,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface CrmLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  location: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  email_opened: boolean | null;
  email_clicked: boolean | null;
  replied_at: string | null;
  reply_text: string | null;
  synced_to_odoo: boolean | null;
  odoo_stage: string | null;
  odoo_stage_synced_at: string | null;
  odoo_won: boolean | null;
  campaign_id: string | null;
  campaigns: { name: string } | null;
}

type Column = "opened" | "clicked" | "replied" | "won" | "lost";

const COLUMNS: { id: Column; label: string; icon: typeof Eye }[] = [
  { id: "opened", label: "Opened", icon: Eye },
  { id: "clicked", label: "Clicked", icon: MousePointerClick },
  { id: "replied", label: "Replied", icon: MessageSquare },
  { id: "won", label: "Won", icon: Trophy },
  { id: "lost", label: "Lost", icon: XCircle },
];

// Won/Lost come from Odoo (synced twice a day) and outrank local
// engagement — a closed deal belongs in its outcome column no matter how
// far the emails got.
function columnFor(lead: CrmLead): Column {
  if (lead.odoo_won === true) return "won";
  if (lead.odoo_won === false) return "lost";
  if (lead.replied_at) return "replied";
  if (lead.email_clicked) return "clicked";
  return "opened";
}

export default function CrmPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [selected, setSelected] = useState<CrmLead | null>(null);

  const { data: leads = [], isLoading } = useQuery<CrmLead[]>({
    queryKey: ["crm-leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // RLS already scopes this to campaigns the caller owns (or all of
      // them, for owner/admin) — no extra filtering needed here. Deal
      // progression itself now lives in Odoo (see odoo_stage, pulled in
      // twice a day) — this board only reflects local engagement.
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, first_name, last_name, full_name, email, company, job_title, location, phone, website, linkedin_url, email_opened, email_clicked, replied_at, reply_text, synced_to_odoo, odoo_stage, odoo_stage_synced_at, odoo_won, campaign_id, campaigns(name)",
        )
        .eq("org_id", orgId!)
        .eq("email_opened", true)
        .order("replied_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as CrmLead[];
    },
  });

  const byColumn = useMemo(() => {
    const grouped: Record<Column, CrmLead[]> = {
      opened: [],
      clicked: [],
      replied: [],
      won: [],
      lost: [],
    };
    for (const lead of leads) {
      grouped[columnFor(lead)].push(lead);
    }
    return grouped;
  }, [leads]);

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">Pipeline</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          {leads.length}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Once a lead clicks or replies the deal is managed in Odoo — each card shows its live Odoo
        stage, and Won/Lost reflect the outcome recorded there. Synced twice a day.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => (
          <div key={col.id} className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
              <col.icon className="h-4 w-4 text-muted-foreground" />
              {col.label}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {byColumn[col.id].length}
              </span>
            </div>
            <div className="space-y-2">
              {byColumn[col.id].length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No leads
                </p>
              ) : (
                byColumn[col.id].map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelected(lead)}
                    className="block w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:shadow"
                  >
                    <p className="truncate text-sm font-medium">
                      {(lead.full_name ??
                        `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()) ||
                        lead.email ||
                        "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[lead.job_title, lead.company].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {lead.campaigns?.name && (
                        <Badge variant="secondary">{lead.campaigns.name}</Badge>
                      )}
                      {lead.odoo_stage && (
                        <Badge variant="info">
                          <Boxes className="h-3 w-3" /> {lead.odoo_stage}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && <LeadDetail lead={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function LeadDetail({ lead, onClose }: { lead: CrmLead; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">
              {(lead.full_name ?? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()) ||
                "Contact"}
            </h3>
            <p className="text-sm text-muted-foreground">{lead.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact Info
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info icon={Briefcase} label="Title" value={lead.job_title} />
              <Info icon={Building2} label="Company" value={lead.company} />
              <Info icon={MapPin} label="Location" value={lead.location} />
              <Info icon={Phone} label="Phone" value={lead.phone} />
              <Info icon={Globe} label="Website" value={lead.website} />
              <Info icon={Linkedin} label="LinkedIn" value={lead.linkedin_url} />
            </div>
          </div>

          {lead.reply_text && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reply
              </h4>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                {lead.reply_text}
              </div>
              {lead.replied_at && (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(lead.replied_at), "MMM d, yyyy HH:mm")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Odoo CRM
            </h4>
            {lead.synced_to_odoo ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Synced to Odoo
                </div>
                {lead.odoo_stage ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3 text-sm">
                    <span className="flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-muted-foreground" /> Stage
                    </span>
                    <Badge variant="info">{lead.odoo_stage}</Badge>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Stage not synced yet — updates twice a day.
                  </p>
                )}
                {lead.odoo_stage_synced_at && (
                  <p className="text-xs text-muted-foreground">
                    Last checked {format(new Date(lead.odoo_stage_synced_at), "MMM d, yyyy HH:mm")}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" /> Not synced — pushed automatically once this
                lead clicks or replies.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Briefcase;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className={cn("flex items-center gap-2")}>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
