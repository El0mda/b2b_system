import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Users,
  Rocket,
  CheckCircle2,
  Eye,
  MessageSquare,
  ArrowUpRight,
  Boxes,
} from "lucide-react";
import { format, subDays } from "date-fns";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, { className: string; pulse?: boolean }> = {
  draft: { className: "bg-muted text-muted-foreground" },
  searching: { className: "bg-blue-500/15 text-blue-600 dark:text-blue-400", pulse: true },
  enriching: { className: "bg-purple-500/15 text-purple-600 dark:text-purple-400", pulse: true },
  active: { className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  paused: { className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  completed: { className: "bg-muted text-muted-foreground" },
};

interface StatCardProps {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
  color: string;
}

function StatCard({ icon: Icon, label, value, hint, color }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", color)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [
        { count: totalLeads },
        activeCampaigns,
        deliveredLeads,
        openedLeads,
        repliedLeads,
        addedLeads,
      ] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId!),
        supabase
          .from("campaigns")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId!)
          .eq("status", "active"),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId!)
          .eq("email_delivered", true),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId!)
          .eq("email_opened", true),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId!)
          .not("replied_at", "is", null),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId!)
          .eq("added_to_campaign", true),
      ]);
      const delivered = deliveredLeads.count ?? 0;
      const opened = openedLeads.count ?? 0;
      const replied = repliedLeads.count ?? 0;
      const added = addedLeads.count ?? 0;
      return {
        totalLeads: totalLeads ?? 0,
        activeCampaigns: activeCampaigns.count ?? 0,
        delivered,
        openRate: delivered ? Math.round((opened / delivered) * 100) : 0,
        replyRate: added ? Math.round((replied / added) * 100) : 0,
      };
    },
  });

  const { data: recentCampaigns } = useQuery({
    queryKey: ["recent-campaigns", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name, status, leads_added, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: sourceMix } = useQuery({
    queryKey: ["lead-sources", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("source")
        .eq("org_id", orgId!);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        const k = r.source ?? "manual";
        counts[k] = (counts[k] ?? 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
  });

  const { data: odooStages } = useQuery({
    queryKey: ["odoo-stages", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("odoo_stage")
        .eq("org_id", orgId!)
        .eq("synced_to_odoo", true);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        const k = r.odoo_stage ?? "Pending sync";
        counts[k] = (counts[k] ?? 0) + 1;
      });
      return Object.entries(counts)
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count);
    },
  });

  // Placeholder series — real impl aggregates from webhook_logs / lead timestamps.
  const activitySeries = Array.from({ length: 30 }).map((_, i) => {
    const d = subDays(new Date(), 29 - i);
    return { day: format(d, "MMM d"), delivered: 0, opened: 0, replied: 0 };
  });

  const PIE_COLORS = ["#4F46E5", "#A855F7", "#10B981", "#F59E0B"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">
            Welcome back{organization ? `, ${organization.name}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            Here's what's happening with your campaigns.
          </p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <Rocket className="h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Users} label="Total Leads" value={stats?.totalLeads ?? "—"} color="bg-blue-500" />
        <StatCard
          icon={Rocket}
          label="Active Campaigns"
          value={stats?.activeCampaigns ?? "—"}
          color="bg-emerald-500"
        />
        <StatCard
          icon={CheckCircle2}
          label="Emails Delivered"
          value={stats?.delivered ?? "—"}
          color="bg-teal-500"
        />
        <StatCard
          icon={Eye}
          label="Open Rate"
          value={`${stats?.openRate ?? 0}%`}
          color="bg-amber-500"
        />
        <StatCard
          icon={MessageSquare}
          label="Reply Rate"
          value={`${stats?.replyRate ?? 0}%`}
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Email Activity (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activitySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="delivered" stroke="#10B981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="opened" stroke="#F59E0B" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="replied" stroke="#A855F7" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {sourceMix && sourceMix.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {sourceMix.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No leads yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Odoo Pipeline</CardTitle>
          <p className="text-sm text-muted-foreground">
            Deal stage for every lead pushed to Odoo, checked twice a day.
          </p>
        </CardHeader>
        <CardContent>
          {odooStages && odooStages.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {odooStages.map(({ stage, count }) => (
                <div
                  key={stage}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-4 py-2.5"
                >
                  <Boxes className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{stage}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No leads synced to Odoo yet — pushed automatically once a lead clicks or replies.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Campaigns</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/campaigns">
              View all <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentCampaigns && recentCampaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Name</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Leads</th>
                    <th className="px-5 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCampaigns.map((c) => {
                    const badge = STATUS_BADGE[c.status ?? "draft"] ?? STATUS_BADGE.draft;
                    return (
                      <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-5 py-3 font-medium">{c.name}</td>
                        <td className="px-5 py-3">
                          <Badge
                            className={cn(badge.className, badge.pulse && "animate-pulse-subtle")}
                          >
                            {c.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">{c.leads_added ?? 0}</td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {c.created_at ? format(new Date(c.created_at), "MMM d, yyyy") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <Rocket className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="mb-4 text-sm text-muted-foreground">No campaigns yet.</p>
              <Button asChild size="sm">
                <Link to="/campaigns/new">Create your first campaign</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
