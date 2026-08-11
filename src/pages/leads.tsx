import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search,
  Download,
  Eye,
  MousePointerClick,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  X,
  Briefcase,
  Building2,
  MapPin,
  Phone,
  Globe,
  Linkedin,
  ChevronLeft,
  ChevronRight,
  MailCheck,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FullPageSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

interface LeadRow {
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
  nb_result: string | null;
  email_valid: boolean | null;
  email_delivered: boolean | null;
  email_opened: boolean | null;
  email_clicked: boolean | null;
  email_bounced: boolean | null;
  replied_at: string | null;
  reply_text: string | null;
  synced_to_odoo: boolean | null;
  created_at: string | null;
  campaign_id: string | null;
  campaigns: { name: string } | null;
}

interface CampaignOption {
  id: string;
  name: string;
}

export default function LeadsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [emailStatusFilter, setEmailStatusFilter] = useState("all");
  const [engagementFilter, setEngagementFilter] = useState("all");
  const [odooFilter, setOdooFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);

  const { data: campaigns = [] } = useQuery<CampaignOption[]>({
    queryKey: ["all-campaigns", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as CampaignOption[];
    },
  });

  const { data: allLeads = [], isLoading } = useQuery<LeadRow[]>({
    queryKey: ["all-leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*, campaigns(name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as LeadRow[];
    },
  });

  const filtered = useMemo(() => {
    return allLeads.filter((l) => {
      if (search) {
        const q = search.toLowerCase();
        const name = (l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`).toLowerCase();
        if (!name.includes(q) && !(l.email ?? "").toLowerCase().includes(q) && !(l.company ?? "").toLowerCase().includes(q) && !(l.job_title ?? "").toLowerCase().includes(q)) return false;
      }
      if (campaignFilter !== "all" && l.campaign_id !== campaignFilter) return false;
      if (sourceFilter !== "all" && (l.source ?? "manual") !== sourceFilter) return false;
      if (emailStatusFilter === "valid" && !l.email_valid) return false;
      if (emailStatusFilter === "invalid" && l.email_valid !== false) return false;
      if (emailStatusFilter === "catchall" && l.nb_result !== "catchall") return false;
      if (emailStatusFilter === "bounced" && !l.email_bounced) return false;
      if (engagementFilter === "opened" && !l.email_opened) return false;
      if (engagementFilter === "clicked" && !l.email_clicked) return false;
      if (engagementFilter === "replied" && !l.replied_at) return false;
      if (odooFilter === "yes" && !l.synced_to_odoo) return false;
      if (odooFilter === "no" && l.synced_to_odoo) return false;
      return true;
    });
  }, [allLeads, search, campaignFilter, sourceFilter, emailStatusFilter, engagementFilter, odooFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleExport = () => {
    const headers = ["Name", "Email", "Company", "Title", "Campaign", "Source", "NB Status", "Engagement", "Reply", "Date"];
    const rows = filtered.map((l) => [
      l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim(),
      l.email ?? "",
      l.company ?? "",
      l.job_title ?? "",
      l.campaigns?.name ?? "",
      l.source ?? "",
      l.nb_result ?? "",
      l.replied_at ? "Replied" : l.email_clicked ? "Clicked" : l.email_opened ? "Opened" : l.email_delivered ? "Delivered" : "Pending",
      l.reply_text ?? "",
      l.created_at ? format(new Date(l.created_at), "MMM d, yyyy") : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Leads</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{allLeads.length}</span>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, email, company, title..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={campaignFilter} onChange={(e) => { setCampaignFilter(e.target.value); setPage(0); }}>
              <option value="all">All Campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}>
              <option value="all">All Sources</option>
              <option value="lusha">Lusha</option>
              <option value="import">Import</option>
              <option value="manual">Manual</option>
            </Select>
            <Select value={emailStatusFilter} onChange={(e) => { setEmailStatusFilter(e.target.value); setPage(0); }}>
              <option value="all">All Email Status</option>
              <option value="valid">Valid</option>
              <option value="invalid">Invalid</option>
              <option value="catchall">Catchall</option>
              <option value="bounced">Bounced</option>
            </Select>
            <Select value={engagementFilter} onChange={(e) => { setEngagementFilter(e.target.value); setPage(0); }}>
              <option value="all">All Engagement</option>
              <option value="opened">Opened</option>
              <option value="clicked">Clicked</option>
              <option value="replied">Replied</option>
            </Select>
            <Select value={odooFilter} onChange={(e) => { setOdooFilter(e.target.value); setPage(0); }}>
              <option value="all">Odoo: All</option>
              <option value="yes">Odoo: Synced</option>
              <option value="no">Odoo: Not Synced</option>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Company</Th>
                  <Th>Title</Th>
                  <Th>Campaign</Th>
                  <Th>Source</Th>
                  <Th>NB Status</Th>
                  <Th>Engagement</Th>
                  <Th>Reply</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {paged.map((l) => (
                  <tr
                    key={l.id}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-muted/40"
                    onClick={() => setSelectedLead(l)}
                  >
                    <Td className="font-medium">
                      {(l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim()) || "—"}
                    </Td>
                    <Td>{l.email ?? "—"}</Td>
                    <Td className="text-muted-foreground">{l.company ?? "—"}</Td>
                    <Td className="text-muted-foreground">{l.job_title ?? "—"}</Td>
                    <Td className="text-muted-foreground">{l.campaigns?.name ?? "—"}</Td>
                    <Td>
                      <Badge className={l.source === "lusha" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : l.source === "import" ? "bg-purple-500/15 text-purple-600 dark:text-purple-400" : "bg-muted text-muted-foreground"}>
                        {l.source ?? "manual"}
                      </Badge>
                    </Td>
                    <Td>
                      <NBBadge result={l.nb_result} valid={l.email_valid} />
                    </Td>
                    <Td>
                      <EngagementIcons lead={l} />
                    </Td>
                    <Td className="max-w-[120px] truncate text-muted-foreground">
                      {l.reply_text ? (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                          {l.reply_text.slice(0, 60)}...
                        </span>
                      ) : "—"}
                    </Td>
                    <Td className="text-muted-foreground">
                      {l.created_at ? format(new Date(l.created_at), "MMM d, yyyy") : "—"}
                    </Td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-sm text-muted-foreground">
                      No leads found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {filtered.length} total · Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Slide-over */}
      {selectedLead && (
        <LeadSlideOver lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-4 py-3 text-sm", className)}>{children}</td>;
}

function NBBadge({ result, valid }: { result: string | null; valid: boolean | null }) {
  if (result === null) return <Badge variant="secondary">Not run</Badge>;
  if (result === "valid" || result === "catchall") return <Badge variant="success">{result}</Badge>;
  if (result === "invalid" || result === "disposable") return <Badge className="bg-destructive/10 text-destructive">{result}</Badge>;
  return <Badge variant="warning">{result}</Badge>;
}

function EngagementIcons({ lead }: { lead: LeadRow }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-sm", lead.email_delivered ? "text-emerald-500" : "text-muted-foreground/30")}>
        <MailCheck className="h-4 w-4" />
      </span>
      <span className={cn("text-sm", lead.email_opened ? "text-amber-500" : "text-muted-foreground/30")}>
        <Eye className="h-4 w-4" />
      </span>
      <span className={cn("text-sm", lead.email_clicked ? "text-blue-500" : "text-muted-foreground/30")}>
        <MousePointerClick className="h-4 w-4" />
      </span>
      <span className={cn("text-sm", lead.replied_at ? "text-purple-500" : "text-muted-foreground/30")}>
        <MessageSquare className="h-4 w-4" />
      </span>
    </div>
  );
}

function LeadSlideOver({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
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
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact Info</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <LeadInfo icon={Briefcase} label="Title" value={lead.job_title} />
              <LeadInfo icon={Building2} label="Company" value={lead.company} />
              <LeadInfo icon={MapPin} label="Location" value={lead.location} />
              <LeadInfo icon={Phone} label="Phone" value={lead.phone} />
              <LeadInfo icon={Globe} label="Website" value={lead.website} />
              <LeadInfo icon={Linkedin} label="LinkedIn" value={lead.linkedin_url} />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Status</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <LeadInfo icon={CheckCircle2} label="NB Result" value={lead.nb_result ?? "Not run"} />
              <LeadInfo icon={AlertCircle} label="Valid" value={lead.email_valid === null ? "Unknown" : lead.email_valid ? "Yes" : "No"} />
              <LeadInfo icon={MailCheck} label="Delivered" value={lead.email_delivered ? "Yes" : "No"} />
              <LeadInfo icon={Eye} label="Opened" value={lead.email_opened ? "Yes" : "No"} />
              <LeadInfo icon={MousePointerClick} label="Clicked" value={lead.email_clicked ? "Yes" : "No"} />
              <LeadInfo icon={MessageSquare} label="Replied" value={lead.replied_at ? "Yes" : "No"} />
            </div>
          </div>

          {lead.reply_text && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reply</h4>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">{lead.reply_text}</div>
              {lead.replied_at && (
                <p className="text-xs text-muted-foreground">{format(new Date(lead.replied_at), "MMM d, yyyy HH:mm")}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Odoo CRM</h4>
            {lead.synced_to_odoo ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Synced to Odoo
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" /> Not synced
              </div>
            )}
          </div>

          {lead.created_at && (
            <div className="text-xs text-muted-foreground">
              Created: {format(new Date(lead.created_at), "MMM d, yyyy HH:mm")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadInfo({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string | null | undefined }) {
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
