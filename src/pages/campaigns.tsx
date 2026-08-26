import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Rocket,
  Plus,
  Search,
  Users,
  CheckCircle2,
  Eye,
  MessageSquare,
  MoreHorizontal,
  FileEdit,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const STATUS_OPTIONS = ["all", "draft", "searching", "enriching", "active", "paused", "completed"];

const STATUS_BADGE: Record<string, { className: string; pulse?: boolean }> = {
  draft: { className: "bg-muted text-muted-foreground" },
  searching: { className: "bg-blue-500/15 text-blue-600 dark:text-blue-400", pulse: true },
  enriching: { className: "bg-purple-500/15 text-purple-600 dark:text-purple-400", pulse: true },
  active: { className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  paused: { className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  completed: { className: "bg-muted text-muted-foreground" },
};

const SOURCE_BADGE: Record<string, string> = {
  lusha: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  import: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  mixed: "bg-muted text-muted-foreground",
};

interface CampaignRow {
  id: string;
  name: string;
  status: string | null;
  source: string | null;
  leads_added: number | null;
  created_at: string | null;
  delivered: number;
  opened: number;
  replied: number;
  creator: { full_name: string | null; email: string | null } | null;
}

export default function CampaignsPage() {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<CampaignRow | null>(null);

  const { data: campaigns = [], isLoading } = useQuery<CampaignRow[]>({
    queryKey: ["campaigns", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // RLS scopes this to campaigns the caller created — or, for
      // owner/admin, every campaign in the org.
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          "id, name, status, source, leads_added, created_at, creator:created_by(full_name, email)",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = data ?? [];
      // Aggregate per-campaign stats from leads in a single query
      const ids = list.map((c) => c.id);
      const statsMap = new Map<string, { delivered: number; opened: number; replied: number }>();
      if (ids.length) {
        const { data: leads } = await supabase
          .from("leads")
          .select("campaign_id, email_delivered, email_opened, replied_at")
          .in("campaign_id", ids);
        (leads ?? []).forEach((l) => {
          const key = l.campaign_id ?? "";
          if (!key) return;
          const row = statsMap.get(key) ?? { delivered: 0, opened: 0, replied: 0 };
          if (l.email_delivered) row.delivered++;
          if (l.email_opened) row.opened++;
          if (l.replied_at) row.replied++;
          statsMap.set(key, row);
        });
      }
      return list.map((c) => ({
        ...c,
        delivered: statsMap.get(c.id)?.delivered ?? 0,
        opened: statsMap.get(c.id)?.opened ?? 0,
        replied: statsMap.get(c.id)?.replied ?? 0,
      }));
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase.functions.invoke("campaign-action", {
        body: { campaign_id: id, action: status },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_data, { status }) => {
      qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
      toast.success(
        status === "active" ? "Campaign activated" : "Campaign set to draft — paused in SmartLead",
      );
    },
    onError: (e: any) => toast.error(e?.message || "Could not update campaign"),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("campaign-action", {
        body: { campaign_id: id, action: "delete" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
      toast.success("Campaign deleted");
      setPendingDelete(null);
    },
    onError: (e: any) => toast.error(e?.message || "Could not delete campaign"),
  });

  if (isLoading) return <FullPageSpinner />;

  const filtered = campaigns.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Track every outbound campaign and its delivery metrics.
          </p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <Plus className="h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="min-w-[180px]">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Rocket className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="mb-4 text-sm text-muted-foreground">
                {campaigns.length === 0
                  ? "No campaigns yet. Create your first campaign or import leads to get started."
                  : "No campaigns match your filters."}
              </p>
              {campaigns.length === 0 && (
                <div className="flex justify-center gap-2">
                  <Button asChild size="sm">
                    <Link to="/campaigns/new">
                      <Plus className="h-4 w-4" /> Create Campaign
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/import">Import Leads</Link>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Replied</TableHead>
                  <TableHead>Created</TableHead>
                  {isAdmin && <TableHead>Created By</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const badge = STATUS_BADGE[c.status ?? "draft"] ?? STATUS_BADGE.draft;
                  const sourceKey = (c.source ?? "lusha").toLowerCase();
                  const sourceClass = SOURCE_BADGE[sourceKey] ?? SOURCE_BADGE.mixed;
                  const sourceLabel =
                    sourceKey === "lusha"
                      ? "Lusha"
                      : sourceKey === "import"
                        ? "Import"
                        : sourceKey === "mixed"
                          ? "Mixed"
                          : sourceKey.charAt(0).toUpperCase() + sourceKey.slice(1);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge
                          className={cn(badge.className, badge.pulse && "animate-pulse-subtle")}
                        >
                          {c.status ?? "draft"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={sourceClass}>{sourceLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.leads_added ?? 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          {c.delivered}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5 text-amber-500" />
                          {c.opened}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5 text-purple-500" />
                          {c.replied}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.created_at ? format(new Date(c.created_at), "MMM d, yyyy") : "—"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-muted-foreground">
                          {c.creator?.full_name ?? c.creator?.email ?? "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/campaigns/${c.id}`}>View</Link>
                          </Button>
                          <DropdownMenu
                            trigger={
                              <Button variant="ghost" size="icon" aria-label="Campaign actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          >
                            {(close) => (
                              <>
                                {c.status !== "draft" && (
                                  <DropdownItem
                                    icon={<FileEdit className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      setStatus.mutate({ id: c.id, status: "draft" });
                                    }}
                                  >
                                    Set to draft
                                  </DropdownItem>
                                )}
                                {c.status !== "active" && (
                                  <DropdownItem
                                    icon={<PlayCircle className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      setStatus.mutate({ id: c.id, status: "active" });
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
                                    setPendingDelete(c);
                                  }}
                                >
                                  Delete
                                </DropdownItem>
                              </>
                            )}
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogHeader>
          <DialogTitle>Delete campaign?</DialogTitle>
          <DialogDescription>
            This permanently deletes "{pendingDelete?.name}" and all its leads, sequences, and
            activity. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteCampaign.isPending}
            onClick={() => pendingDelete && deleteCampaign.mutate(pendingDelete.id)}
          >
            {deleteCampaign.isPending && <Spinner />}
            Delete campaign
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
