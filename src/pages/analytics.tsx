import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, format } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  Users,
  Rocket,
  CheckCircle2,
  Eye,
  MessageSquare,
  Search,
  MousePointerClick,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FullPageSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type DateRange = "7" | "30" | "90" | "all";

const PIE_COLORS = ["#4F46E5", "#A855F7", "#10B981", "#F59E0B", "#EF4444"];
const ENG_COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function AnalyticsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [range, setRange] = useState<DateRange>("30");

  const dateCutoff = useMemo(() => {
    if (range === "all") return null;
    return subDays(new Date(), Number(range)).toISOString();
  }, [range]);

  const { data: allLeads = [], isLoading } = useQuery<any[]>({
    queryKey: ["analytics-leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const leads = useMemo(() => {
    if (!dateCutoff) return allLeads;
    return allLeads.filter((l) => l.created_at >= dateCutoff);
  }, [allLeads, dateCutoff]);

  const { data: campaigns = [] } = useQuery<any[]>({
    queryKey: ["analytics-campaigns", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name, leads_added, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (isLoading) return <FullPageSpinner />;

  const total = leads.length || 1;
  const delivered = leads.filter((l: any) => l.email_delivered).length;
  const opened = leads.filter((l: any) => l.email_opened).length;
  const clicked = leads.filter((l: any) => l.email_clicked).length;
  const replied = leads.filter((l: any) => l.replied_at).length;
  const bounced = leads.filter((l: any) => l.email_bounced).length;

  const enriched = leads.filter((l: any) => l.email_valid !== null || l.added_to_campaign).length;
  const sent = delivered;

  // Activity over time chart data
  const dayMap = new Map<string, { sent: number; delivered: number; opened: number; clicked: number; replied: number }>();
  const addDay = (key: string, field: keyof typeof dayMap extends undefined ? never : string) => {
    // handled per lead below
  };
  leads.forEach((l: any) => {
    if (l.created_at) {
      const day = l.created_at.slice(0, 10);
      const e = dayMap.get(day) ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0 };
      e.sent++;
      if (l.email_delivered) e.delivered++;
      if (l.email_opened) e.opened++;
      if (l.email_clicked) e.clicked++;
      if (l.replied_at) {
        const rDay = l.replied_at.slice(0, 10);
        if (rDay !== day) {
          const rEntry = dayMap.get(rDay) ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0 };
          rEntry.replied++;
          dayMap.set(rDay, rEntry);
        } else {
          e.replied++;
        }
      }
      dayMap.set(day, e);
    }
  });

  const activityData = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, vals]) => ({ day: format(new Date(day), "MMM d"), ...vals }));

  // Verification donut
  const nbCounts: Record<string, number> = {};
  leads.forEach((l: any) => {
    const k = l.nb_result ?? "unknown";
    nbCounts[k] = (nbCounts[k] ?? 0) + 1;
  });
  const verifData = Object.entries(nbCounts).map(([name, value]) => ({ name, value }));

  // Campaign performance bars
  const campaignBars = campaigns
    .map((c: any) => {
      const campLeads = allLeads.filter((l: any) => l.campaign_id === c.id);
      const cTotal = campLeads.length || 1;
      const cReplied = campLeads.filter((l: any) => l.replied_at).length;
      return { name: c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name, replyRate: Math.round((cReplied / cTotal) * 100) };
    })
    .sort((a, b) => b.replyRate - a.replyRate)
    .slice(0, 10);

  // Funnel
  const funnel = [
    { label: "Searched", value: total, pct: 100 },
    { label: "Enriched", value: enriched, pct: Math.round((enriched / total) * 100) },
    { label: "Verified", value: leads.filter((l: any) => l.nb_result).length, pct: Math.round((leads.filter((l: any) => l.nb_result).length / total) * 100) },
    { label: "Sent", value: sent, pct: Math.round((sent / total) * 100) },
    { label: "Delivered", value: delivered, pct: Math.round((delivered / total) * 100) },
    { label: "Opened", value: opened, pct: Math.round((opened / total) * 100) },
    { label: "Replied", value: replied, pct: Math.round((replied / total) * 100) },
  ];

  // Source mix
  const sourceCounts: Record<string, number> = {};
  leads.forEach((l: any) => {
    const k = l.source ?? "manual";
    sourceCounts[k] = (sourceCounts[k] ?? 0) + 1;
  });
  const sourceData = Object.entries(sourceCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-sm text-muted-foreground">Campaign performance across all time.</p>
        </div>
        <Select value={range} onChange={(e) => setRange(e.target.value as DateRange)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Search} label="Searched" value={total} color="bg-blue-500" />
        <StatCard icon={Users} label="Enriched" value={enriched} color="bg-purple-500" />
        <StatCard icon={CheckCircle2} label="Verified" value={leads.filter((l: any) => l.nb_result).length} color="bg-amber-500" />
        <StatCard icon={Rocket} label="Delivered" value={delivered} color="bg-indigo-500" />
        <StatCard icon={Eye} label="Opened" value={opened} color="bg-blue-500" />
        <StatCard icon={MessageSquare} label="Replied" value={replied} color="bg-emerald-500" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Activity area chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Email Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data yet.</div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip />
                    <Legend />
                    <Area type="monotone" dataKey="sent" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} name="Sent" />
                    <Area type="monotone" dataKey="delivered" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Delivered" />
                    <Area type="monotone" dataKey="opened" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Opened" />
                    <Area type="monotone" dataKey="clicked" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="Clicked" />
                    <Area type="monotone" dataKey="replied" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Replied" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verification donut */}
        <Card>
          <CardHeader>
            <CardTitle>Verification Results</CardTitle>
          </CardHeader>
          <CardContent>
            {verifData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data yet.</div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={verifData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                      {verifData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Campaign performance bars */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Performance (Reply Rate)</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignBars.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No campaigns yet.</div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignBars} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                    <ReTooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="replyRate" name="Reply Rate" radius={[0, 4, 4, 0]}>
                      {campaignBars.map((_, i) => (
                        <Cell key={i} fill={ENG_COLORS[i % ENG_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {funnel.map((f, i) => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="w-20 text-xs font-medium text-muted-foreground">{f.label}</span>
                <div className="flex-1">
                  <div className="flex h-7 items-center rounded-md bg-muted">
                    <div
                      className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-indigo-500 to-indigo-600 px-2 text-xs font-medium text-white transition-all"
                      style={{ width: `${f.pct}%` }}
                    >
                      {f.pct >= 15 ? `${f.pct}%` : ""}
                    </div>
                  </div>
                </div>
                <span className="w-16 text-right text-xs font-medium">{f.value}</span>
                {i > 0 && (
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    -{100 - f.pct}%
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Lead Sources donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data yet.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                      {sourceData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
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
