import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Clock,
  RefreshCw,
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

interface OdooStage {
  id: number;
  name: string;
  sequence: number;
}

// Leads that haven't reached Odoo yet (no click or reply) have no stage
// there, so they'd otherwise vanish from this board entirely.
const NOT_IN_ODOO = "__not_in_odoo__";

function iconForStage(name: string) {
  if (/\bwon\b/i.test(name)) return Trophy;
  if (/\blost\b/i.test(name)) return XCircle;
  if (/repl/i.test(name)) return MessageSquare;
  if (/click/i.test(name)) return MousePointerClick;
  if (/open/i.test(name)) return Eye;
  return Boxes;
}

export default function CrmPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const queryClient = useQueryClient();

  // Odoo is polled on a schedule, so the board can lag a stage change by
  // a few minutes. This pulls right now for someone watching both
  // screens at once.
  const refresh = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("odoo-sync", { body: {} });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads", orgId] });
      queryClient.invalidateQueries({ queryKey: ["odoo-stages", orgId] });
    },
  });

  // The board mirrors the org's real Odoo pipeline. The stage list is
  // published by odoo-sync (the browser has no Odoo credentials), so
  // until that first runs there are no Odoo columns to draw.
  const { data: stages = [] } = useQuery<OdooStage[]>({
    queryKey: ["odoo-stages", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("org_id", orgId!)
        .eq("key", "odoo_stages")
        .maybeSingle();
      if (!data?.value) return [];
      try {
        return (JSON.parse(data.value) as OdooStage[]).sort(
          (a, b) => a.sequence - b.sequence,
        );
      } catch {
        return [];
      }
    },
  });

  const { data: leads = [], isLoading } = useQuery<CrmLead[]>({
    queryKey: ["crm-leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // RLS already scopes this to campaigns the caller owns (or all of
      // them, for owner/admin) — no extra filtering needed here.
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, first_name, last_name, full_name, email, company, job_title, location, phone, website, linkedin_url, email_opened, email_clicked, replied_at, reply_text, synced_to_odoo, odoo_stage, odoo_stage_synced_at, odoo_won, campaign_id, campaigns(name)",
        )
        .eq("org_id", orgId!)
        .order("replied_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as CrmLead[];
    },
  });

  const columns = useMemo(
    () => [
      { key: NOT_IN_ODOO, label: "Not in Odoo yet", icon: Clock },
      ...stages.map((s) => ({ key: s.name, label: s.name, icon: iconForStage(s.name) })),
    ],
    [stages],
  );

  const byColumn = useMemo(() => {
    const grouped: Record<string, CrmLead[]> = {};
    for (const col of columns) grouped[col.key] = [];
    for (const lead of leads) {
      // Match on the stage name Odoo reported for this lead. An unknown
      // name (stage renamed or deleted since the last sync) falls back
      // rather than dropping the lead off the board.
      const key = lead.odoo_stage && grouped[lead.odoo_stage] ? lead.odoo_stage : NOT_IN_ODOO;
      grouped[key].push(lead);
    }
    return grouped;
  }, [leads, columns]);

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">Pipeline</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          {leads.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          <RefreshCw className={cn("h-4 w-4", refresh.isPending && "animate-spin")} />
          {refresh.isPending ? "Refreshing…" : "Refresh from Odoo"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        These are your Odoo pipeline stages, mirrored here — a lead enters Odoo when it clicks or
        replies, and everything after that is driven by Odoo. Stages sync automatically every 5
        minutes.
      </p>
      {refresh.isError && (
        <p className="text-sm text-destructive">
          Couldn't reach Odoo — check the connection in Settings.
        </p>
      )}

      {stages.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Odoo stages haven't been synced yet — they'll appear after the next sync run.
        </p>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div key={col.key} className="w-60 shrink-0 space-y-3">
            <div className="flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
              <col.icon className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{col.label}</span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {byColumn[col.key]?.length ?? 0}
              </span>
            </div>
            <div className="space-y-2">
              {(byColumn[col.key]?.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No leads
                </p>
              ) : (
                byColumn[col.key].map((lead) => (
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
                    Stage not synced yet — updates every 5 minutes.
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
