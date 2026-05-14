import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Rocket,
  Plus,
  Search,
  Users,
  CheckCircle2,
  Eye,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";

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
import { FullPageSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = ["all", "draft", "searching", "enriching", "active", "paused", "completed"];

const STATUS_BADGE: Record<string, { className: string; pulse?: boolean }> = {
  draft: { className: "bg-muted text-muted-foreground" },
  searching: { className: "bg-blue-100 text-blue-700", pulse: true },
  enriching: { className: "bg-purple-100 text-purple-700", pulse: true },
  active: { className: "bg-emerald-100 text-emerald-700" },
  paused: { className: "bg-amber-100 text-amber-700" },
  completed: { className: "bg-gray-200 text-gray-700" },
};

const SOURCE_BADGE: Record<string, string> = {
  lusha: "bg-blue-100 text-blue-700",
  import: "bg-purple-100 text-purple-700",
  mixed: "bg-gray-100 text-gray-700",
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
}

export default function CampaignsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: campaigns = [], isLoading } = useQuery<CampaignRow[]>({
    queryKey: ["campaigns", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, source, leads_added, created_at")
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
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/campaigns/${c.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
