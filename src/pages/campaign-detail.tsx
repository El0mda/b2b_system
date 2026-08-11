import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  Search,
  CheckCircle2,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertCircle,
  Rocket,
  Mail,
  Phone,
  Globe,
  Building2,
  Briefcase,
  MapPin,
  Linkedin,
  Download,
  ChevronRight,
  X,
  Clock,
  Loader2,
  MoreHorizontal,
  FileEdit,
  PlayCircle,
  Trash2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { DropdownMenu, DropdownItem } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tab = "overview" | "leads" | "sequences" | "performance" | "activity";

interface Campaign {
  id: string;
  name: string;
  status: string | null;
  source: string | null;
  sender_name: string | null;
  sender_email: string | null;
  reply_to_email: string | null;
  timezone: string | null;
  leads_added: number | null;
  leads_searched: number | null;
  leads_enriched: number | null;
  leads_verified: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  source: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  website: string | null;
  email_delivered: boolean | null;
  email_opened: boolean | null;
  email_opened_at: string | null;
  email_clicked: boolean | null;
  email_clicked_at: string | null;
  email_bounced: boolean | null;
  email_bounce_reason: string | null;
  current_step: number | null;
  reply_text: string | null;
  replied_at: string | null;
  nb_result: string | null;
  email_valid: boolean | null;
  synced_to_odoo: boolean | null;
  odoo_lead_id: string | null;
  created_at: string | null;
}

interface SequenceStep {
  id: string;
  step: number;
  delay_days: number | null;
  subject: string;
  body: string;
  created_at: string | null;
}

interface WebhookLog {
  id: string;
  event_type: string | null;
  source: string | null;
  lead_email: string | null;
  lead_name: string | null;
  created_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  searching: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  enriching: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-muted text-muted-foreground",
};

const LEAD_STATUS = (l: Lead): { label: string; className: string } => {
  if (l.replied_at)
    return { label: "Replied", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400" };
  if (l.email_clicked)
    return { label: "Clicked", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" };
  if (l.email_opened)
    return { label: "Opened", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  if (l.email_bounced) return { label: "Bounced", className: "bg-destructive/10 text-destructive" };
  if (l.email_delivered)
    return { label: "Sent", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
  return { label: "Pending", className: "bg-muted text-muted-foreground" };
};

const FILTER_OPTIONS = ["all", "delivered", "opened", "replied", "bounced"] as const;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { organization } = useAuth();
  const orgId = organization?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [leadFilter, setLeadFilter] = useState<string>("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: campaign, isLoading: campLoading } = useQuery<Campaign | null>({
    queryKey: ["campaign", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      return data as Campaign | null;
    },
  });

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["campaign-leads", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("campaign_id", id!)
        .order("created_at", { ascending: true });
      return (data ?? []) as Lead[];
    },
  });

  const { data: sequences = [] } = useQuery<SequenceStep[]>({
    queryKey: ["campaign-sequences", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("sequences")
        .select("*")
        .eq("campaign_id", id!)
        .order("step", { ascending: true });
      return (data ?? []) as SequenceStep[];
    },
  });

  const { data: webhookLogs = [] } = useQuery<WebhookLog[]>({
    queryKey: ["campaign-webhooks", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("webhook_logs")
        .select("id, event_type, source, lead_email, lead_name, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as WebhookLog[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!id) return;
      const { data, error } = await supabase.functions.invoke("campaign-action", {
        body: { campaign_id: id, action: status },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
      toast.success(
        status === "active" ? "Campaign activated" : "Campaign set to draft — paused in SmartLead",
      );
    },
    onError: (e: any) => toast.error(e?.message || "Could not update campaign"),
  });

  const deleteCampaign = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { data, error } = await supabase.functions.invoke("campaign-action", {
        body: { campaign_id: id, action: "delete" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
      toast.success("Campaign deleted");
      navigate("/campaigns", { replace: true });
    },
    onError: (e: any) => toast.error(e?.message || "Could not delete campaign"),
  });

  if (campLoading) return <FullPageSpinner />;
  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">Campaign not found</p>
        <Button asChild variant="outline">
          <Link to="/campaigns">Back to Campaigns</Link>
        </Button>
      </div>
    );
  }

  const leadStats = {
    total: leads.length,
    delivered: leads.filter((l) => l.email_delivered).length,
    opened: leads.filter((l) => l.email_opened).length,
    clicked: leads.filter((l) => l.email_clicked).length,
    replied: leads.filter((l) => l.replied_at).length,
    bounced: leads.filter((l) => l.email_bounced).length,
  };

  const filteredLeads = leads.filter((l) => {
    if (leadFilter === "delivered" && !l.email_delivered) return false;
    if (leadFilter === "opened" && !l.email_opened) return false;
    if (leadFilter === "replied" && !l.replied_at) return false;
    if (leadFilter === "bounced" && !l.email_bounced) return false;
    if (leadSearch) {
      const q = leadSearch.toLowerCase();
      const name = (l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`).toLowerCase();
      if (!name.includes(q) && !(l.email ?? "").toLowerCase().includes(q) && !(l.company ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sourceLabel = campaign.source === "lusha" ? "Lusha" : campaign.source === "import" ? "Import" : campaign.source ?? "—";
  const createdDate = campaign.created_at ? format(new Date(campaign.created_at), "MMM d, yyyy HH:mm") : "—";

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "leads", label: "Leads", count: leads.length },
    { key: "sequences", label: "Sequences", count: sequences.length },
    { key: "performance", label: "Email Performance" },
    { key: "activity", label: "Activity Log" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{campaign.name}</h2>
              <Badge className={STATUS_STYLES[campaign.status ?? "draft"] ?? ""}>
                {campaign.status ?? "draft"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Created {createdDate}</p>
          </div>
        </div>

        <DropdownMenu
          trigger={
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4" />
              Manage
            </Button>
          }
        >
          {(close) => (
            <>
              {campaign.status !== "draft" && (
                <DropdownItem
                  icon={<FileEdit className="h-4 w-4" />}
                  onSelect={() => {
                    close();
                    setStatus.mutate("draft");
                  }}
                >
                  Set to draft
                </DropdownItem>
              )}
              {campaign.status !== "active" && (
                <DropdownItem
                  icon={<PlayCircle className="h-4 w-4" />}
                  onSelect={() => {
                    close();
                    setStatus.mutate("active");
                  }}
                >
                  Activate
                </DropdownItem>
              )}
              <DropdownItem
                destructive
                icon={<Trash2 className="h-4 w-4" />}
                onSelect={() => {
                  close();
                  setConfirmDelete(true);
                }}
              >
                Delete
              </DropdownItem>
            </>
          )}
        </DropdownMenu>
      </div>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogHeader>
          <DialogTitle>Delete campaign?</DialogTitle>
          <DialogDescription>
            This permanently deletes "{campaign.name}" and all its leads, sequences, and activity.
            This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteCampaign.isPending}
            onClick={() => deleteCampaign.mutate()}
          >
            {deleteCampaign.isPending && <Spinner />}
            Delete campaign
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <TabOverview campaign={campaign} leadStats={leadStats} sourceLabel={sourceLabel} createdDate={createdDate} />
      )}
      {tab === "leads" && (
        <TabLeads
          leads={filteredLeads}
          totalLeads={leads.length}
          filter={leadFilter}
          onFilterChange={setLeadFilter}
          search={leadSearch}
          onSearchChange={setLeadSearch}
          selectedLead={selectedLead}
          onSelectLead={setSelectedLead}
          onCloseLead={() => setSelectedLead(null)}
        />
      )}
      {tab === "sequences" && <TabSequences sequences={sequences} />}
      {tab === "performance" && (
        <TabPerformance leads={leads} campaign={campaign} />
      )}
      {tab === "activity" && (
        <TabActivity
          campaign={campaign}
          leads={leads}
          webhookLogs={webhookLogs}
          createdDate={createdDate}
        />
      )}
    </div>
  );
}

// ─── Tab 1: Overview ──────────────────────────────────────────────────────────

function TabOverview({
  campaign,
  leadStats,
  sourceLabel,
  createdDate,
}: {
  campaign: Campaign;
  leadStats: { total: number; delivered: number; opened: number; clicked: number; replied: number; bounced: number };
  sourceLabel: string;
  createdDate: string;
}) {
  const pipelineStages = [
    { label: "Search", count: campaign.leads_searched ?? leadStats.total, icon: Search, color: "bg-blue-500" },
    { label: "Enrich", count: campaign.leads_enriched ?? leadStats.total, icon: Users, color: "bg-purple-500" },
    { label: "Verify", count: campaign.leads_verified ?? leadStats.total, icon: CheckCircle2, color: "bg-amber-500" },
    { label: "Send", count: leadStats.delivered, icon: Mail, color: "bg-indigo-500" },
    { label: "Reply", count: leadStats.replied, icon: MessageSquare, color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Campaign Info */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <InfoItem label="Name" value={campaign.name} />
          <InfoItem label="Status" value={campaign.status ?? "—"} />
          <InfoItem label="Sender" value={campaign.sender_name ? `${campaign.sender_name} <${campaign.sender_email}>` : campaign.sender_email ?? "—"} />
          <InfoItem label="Timezone" value={campaign.timezone ?? "—"} />
          <InfoItem label="Source" value={sourceLabel} />
          <InfoItem label="Created" value={createdDate} />
        </CardContent>
      </Card>

      {/* Pipeline Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {pipelineStages.map((stage, i) => (
              <div key={stage.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-white", stage.color)}>
                  <stage.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
                <span className="text-sm font-bold">{stage.count}</span>
                {i < pipelineStages.length - 1 && (
                  <div className="hidden h-0.5 w-full rounded bg-border sm:block" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Search} label="Searched" value={campaign.leads_searched ?? leadStats.total} color="bg-blue-500" />
        <StatCard icon={Users} label="Enriched" value={campaign.leads_enriched ?? leadStats.total} color="bg-purple-500" />
        <StatCard icon={CheckCircle2} label="Verified" value={campaign.leads_verified ?? leadStats.total} color="bg-amber-500" />
        <StatCard icon={Mail} label="Delivered" value={leadStats.delivered} color="bg-indigo-500" />
        <StatCard icon={Eye} label="Opened" value={leadStats.opened} color="bg-blue-500" />
        <StatCard icon={MousePointerClick} label="Clicked" value={leadStats.clicked} color="bg-cyan-500" />
        <StatCard icon={MessageSquare} label="Replied" value={leadStats.replied} color="bg-emerald-500" />
      </div>
    </div>
  );
}

// ─── Tab 2: Leads ─────────────────────────────────────────────────────────────

function TabLeads({
  leads,
  totalLeads,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  selectedLead,
  onSelectLead,
  onCloseLead,
}: {
  leads: Lead[];
  totalLeads: number;
  filter: string;
  onFilterChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  selectedLead: Lead | null;
  onSelectLead: (l: Lead | null) => void;
  onCloseLead: () => void;
}) {
  const handleExport = () => {
    const headers = ["Name", "Email", "Company", "Title", "Source", "Status", "Delivered", "Opened", "Replied", "Step"];
    const rows = leads.map((l) => [
      l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim(),
      l.email ?? "",
      l.company ?? "",
      l.job_title ?? "",
      l.source ?? "",
      LEAD_STATUS(l).label,
      l.email_delivered ? "Yes" : "No",
      l.email_opened ? "Yes" : "No",
      l.replied_at ? "Yes" : "No",
      String(l.current_step ?? ""),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filter} onChange={(e) => onFilterChange(e.target.value)}>
              {FILTER_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f === "all" ? `All (${totalLeads})` : f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Company</Th>
                  <Th>Title</Th>
                  <Th>Source</Th>
                  <Th>Status</Th>
                  <Th>Delivered</Th>
                  <Th>Opened</Th>
                  <Th>Replied</Th>
                  <Th>Step</Th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const status = LEAD_STATUS(l);
                  return (
                    <tr
                      key={l.id}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-muted/40"
                      onClick={() => onSelectLead(l)}
                    >
                      <Td className="font-medium">
                        {(l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim()) || "—"}
                      </Td>
                      <Td>{l.email ?? "—"}</Td>
                      <Td className="text-muted-foreground">{l.company ?? "—"}</Td>
                      <Td className="text-muted-foreground">{l.job_title ?? "—"}</Td>
                      <Td>
                        <Badge className={l.source === "lusha" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-purple-500/15 text-purple-600 dark:text-purple-400"}>
                          {l.source === "lusha" ? "Lusha" : "Import"}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge className={status.className}>{status.label}</Badge>
                      </Td>
                      <Td>{l.email_delivered ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : "—"}</Td>
                      <Td>{l.email_opened ? <Eye className="h-4 w-4 text-amber-500" /> : "—"}</Td>
                      <Td>{l.replied_at ? <MessageSquare className="h-4 w-4 text-purple-500" /> : "—"}</Td>
                      <Td>{l.current_step ?? "—"}</Td>
                    </tr>
                  );
                })}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-sm text-muted-foreground">
                      No leads match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Slide-over Panel */}
      {selectedLead && (
        <LeadSlideOver lead={selectedLead} onClose={onCloseLead} />
      )}
    </div>
  );
}

function LeadSlideOver({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const status = LEAD_STATUS(lead);

  // Build a mock email timeline from available data
  const timeline: Array<{ label: string; time: string; icon: typeof Mail }> = [];
  if (lead.email_delivered) {
    timeline.push({ label: "Step 1 sent", time: lead.created_at ?? "", icon: Mail });
  }
  if (lead.email_delivered) {
    timeline.push({ label: "Delivered", time: lead.created_at ?? "", icon: CheckCircle2 });
  }
  if (lead.email_opened_at) {
    timeline.push({ label: "Opened", time: lead.email_opened_at, icon: Eye });
  }
  if (lead.current_step && lead.current_step > 1) {
    timeline.push({ label: `Step ${lead.current_step} sent`, time: "", icon: Mail });
  }
  if (lead.email_clicked_at) {
    timeline.push({ label: "Clicked", time: lead.email_clicked_at, icon: MousePointerClick });
  }
  if (lead.replied_at) {
    timeline.push({ label: "Replied", time: lead.replied_at, icon: MessageSquare });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">
              {(lead.full_name ?? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()) || "Contact"}
            </h3>
            <p className="text-sm text-muted-foreground">{lead.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Lead Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact Info</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow icon={Briefcase} label="Title" value={lead.job_title} />
              <InfoRow icon={Building2} label="Company" value={lead.company} />
              <InfoRow icon={MapPin} label="Location" value={lead.location} />
              <InfoRow icon={Phone} label="Phone" value={lead.phone} />
              <InfoRow icon={Globe} label="Website" value={lead.website} />
              <InfoRow icon={Linkedin} label="LinkedIn" value={lead.linkedin_url} />
              <InfoRow icon={CheckCircle2} label="Status" value={status.label} />
            </div>
          </div>

          {/* Email Timeline */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Timeline</h4>
            <div className="space-y-0">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No email activity yet.</p>
              ) : (
                timeline.map((t, i) => (
                  <div key={i} className="relative flex gap-3 pb-4 pl-6 last:pb-0">
                    {i < timeline.length - 1 && (
                      <div className="absolute left-2.5 top-4 h-full w-px bg-border" />
                    )}
                    <div className="absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-border bg-card">
                      <t.icon className="h-2.5 w-2.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t.label}</p>
                      {t.time && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(t.time), "MMM d, yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Reply Text */}
          {lead.reply_text && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reply</h4>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                {lead.reply_text}
              </div>
            </div>
          )}

          {/* Odoo Sync */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Odoo CRM</h4>
            {lead.synced_to_odoo ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Synced to Odoo{lead.odoo_lead_id ? ` (Lead ID: ${lead.odoo_lead_id})` : ""}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Not synced to Odoo
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 3: Sequences ─────────────────────────────────────────────────────────

function TabSequences({ sequences }: { sequences: SequenceStep[] }) {
  if (sequences.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No sequences defined for this campaign.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sequences.map((s, i) => (
        <Card key={s.id ?? i}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {s.step}
                </div>
                <div>
                  <p className="text-sm font-semibold">{s.subject || "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">
                    {i === 0 ? "Sent immediately" : `Delayed ${s.delay_days ?? 0} days after previous step`}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{s.body || "(no body)"}</pre>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab 4: Email Performance ─────────────────────────────────────────────────

function TabPerformance({ leads, campaign }: { leads: Lead[]; campaign: Campaign }) {
  const total = leads.length || 1;
  const delivered = leads.filter((l) => l.email_delivered).length;
  const opened = leads.filter((l) => l.email_opened).length;
  const clicked = leads.filter((l) => l.email_clicked).length;
  const replied = leads.filter((l) => l.replied_at).length;
  const bounced = leads.filter((l) => l.email_bounced).length;

  const metrics = [
    { label: "Delivery Rate", value: delivered, total, pct: Math.round((delivered / total) * 100), color: "bg-indigo-500" },
    { label: "Open Rate", value: opened, total, pct: Math.round((opened / total) * 100), color: "bg-blue-500" },
    { label: "Click Rate", value: clicked, total, pct: Math.round((clicked / total) * 100), color: "bg-cyan-500" },
    { label: "Reply Rate", value: replied, total, pct: Math.round((replied / total) * 100), color: "bg-emerald-500" },
    { label: "Bounce Rate", value: bounced, total, pct: Math.round((bounced / total) * 100), color: "bg-destructive" },
  ];

  // Build chart data: group by day
  const dayMap = new Map<string, { deliveries: number; opens: number; replies: number }>();
  leads.forEach((l) => {
    if (l.created_at) {
      const day = l.created_at.slice(0, 10);
      const entry = dayMap.get(day) ?? { deliveries: 0, opens: 0, replies: 0 };
      if (l.email_delivered) entry.deliveries++;
      if (l.email_opened) entry.opens++;
      if (l.replied_at) dayMap.set(l.replied_at.slice(0, 10), { ...entry, replies: (dayMap.get(l.replied_at.slice(0, 10)) ?? entry).replies + 1 });
      dayMap.set(day, entry);
    }
  });

  const chartData = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, vals]) => ({ day: format(new Date(day), "MMM d"), ...vals }));

  return (
    <div className="space-y-6">
      {/* Rate Bars */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-2xl font-bold">{m.pct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all", m.color)} style={{ width: `${m.pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{m.value} / {m.total} leads</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Over Time Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Email Activity Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No activity data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip />
                <Line type="monotone" dataKey="deliveries" stroke="#6366f1" strokeWidth={2} name="Deliveries" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="opens" stroke="#3b82f6" strokeWidth={2} name="Opens" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="replies" stroke="#10b981" strokeWidth={2} name="Replies" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5: Activity Log ──────────────────────────────────────────────────────

function TabActivity({
  campaign,
  leads,
  webhookLogs,
  createdDate,
}: {
  campaign: Campaign;
  leads: Lead[];
  webhookLogs: WebhookLog[];
  createdDate: string;
}) {
  const events: Array<{ time: string; icon: typeof Clock; label: string; desc: string }> = [];

  // Campaign created
  if (campaign.created_at) {
    events.push({
      time: campaign.created_at,
      icon: Rocket,
      label: "Campaign created",
      desc: createdDate,
    });
  }

  // Leads found/imported
  if (campaign.leads_added && campaign.leads_added > 0) {
    events.push({
      time: campaign.updated_at ?? campaign.created_at ?? "",
      icon: Users,
      label: campaign.source === "lusha"
        ? `${campaign.leads_added} leads found from Lusha`
        : `${campaign.leads_added} leads imported from file`,
      desc: "",
    });
  }

  // Enriched
  if (campaign.leads_enriched && campaign.leads_enriched > 0) {
    events.push({
      time: campaign.updated_at ?? campaign.created_at ?? "",
      icon: Users,
      label: `${campaign.leads_enriched} emails enriched`,
      desc: "",
    });
  }

  // Verified
  if (campaign.leads_verified && campaign.leads_verified > 0) {
    events.push({
      time: campaign.updated_at ?? campaign.created_at ?? "",
      icon: CheckCircle2,
      label: `${campaign.leads_verified} emails verified`,
      desc: "",
    });
  }

  // Launched
  if (campaign.status === "active" || campaign.status === "completed") {
    events.push({
      time: campaign.updated_at ?? campaign.created_at ?? "",
      icon: Mail,
      label: `Campaign launched — ${leads.length} emails sent`,
      desc: "",
    });
  }

  // Webhook events
  webhookLogs
    .filter((w) => w.event_type !== "email.bounced" || true)
    .forEach((w) => {
      if (!w.created_at) return;
      const eventLabel = w.event_type === "email.delivered" ? "Email delivered"
        : w.event_type === "email.opened" ? `Email opened${w.lead_name ? ` by ${w.lead_name}` : ""}`
        : w.event_type === "email.clicked" ? `Email clicked${w.lead_name ? ` by ${w.lead_name}` : ""}`
        : w.event_type === "email.bounced" ? "Email bounced"
        : w.event_type === "email.replied" || w.event_type === "inbound_reply"
          ? `Reply from ${w.lead_name ?? w.lead_email ?? "contact"}`
          : w.event_type ?? "Event";
      const eventIcon = w.event_type === "email.delivered" ? CheckCircle2
        : w.event_type === "email.opened" ? Eye
        : w.event_type === "email.clicked" ? MousePointerClick
        : w.event_type === "email.bounced" ? AlertCircle
        : w.event_type === "email.replied" || w.event_type === "inbound_reply" ? MessageSquare
        : Clock;

      events.push({ time: w.created_at, icon: eventIcon, label: eventLabel, desc: w.lead_email ?? "" });
    });

  // Replies from leads
  leads.filter((l) => l.replied_at).forEach((l) => {
    events.push({
      time: l.replied_at!,
      icon: MessageSquare,
      label: `Reply from ${(l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim()) || (l.email ?? "contact")}`,
      desc: l.reply_text ?? "",
    });
  });

  // Odoo syncs
  leads.filter((l) => l.synced_to_odoo).forEach((l) => {
    events.push({
      time: l.updated_at ?? l.created_at ?? "",
      icon: CheckCircle2,
      label: `Opportunity created in Odoo for ${l.full_name ?? l.email ?? "contact"}`,
      desc: l.odoo_lead_id ? `Odoo Lead ID: ${l.odoo_lead_id}` : "",
    });
  });

  // Sort by time descending
  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <Card>
      <CardContent className="p-6">
        {events.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No activity yet.</div>
        ) : (
          <div className="space-y-0">
            {events.map((e, i) => (
              <div key={i} className="relative flex gap-4 pb-6 pl-8 last:pb-0">
                {i < events.length - 1 && (
                  <div className="absolute left-3.5 top-5 h-full w-px bg-border" />
                )}
                <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-border bg-card">
                  <e.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{e.label}</p>
                  {e.desc && <p className="mt-0.5 text-xs text-muted-foreground">{e.desc}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {format(new Date(e.time), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Shared Sub-components ────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-4 py-3 text-sm", className)}>{children}</td>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", color)}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
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
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
