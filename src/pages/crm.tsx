import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Sparkles,
  Eye,
  MousePointerClick,
  MessageSquare,
  CalendarClock,
  Users,
  Trophy,
  XCircle,
  X,
  Briefcase,
  Building2,
  MapPin,
  Phone,
  Globe,
  Linkedin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FullPageSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type PipelineStage = "demo_booked" | "meeting_held" | "won" | "lost";

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
  pipeline_stage: PipelineStage | null;
  demo_booked_at: string | null;
  meeting_held_at: string | null;
  closed_at: string | null;
  synced_to_odoo: boolean | null;
  campaign_id: string | null;
  campaigns: { name: string } | null;
}

type Column =
  | "new"
  | "opened"
  | "clicked"
  | "replied"
  | "demo_booked"
  | "meeting_held"
  | "won"
  | "lost";

const COLUMNS: { id: Column; label: string; icon: typeof Eye }[] = [
  { id: "new", label: "New", icon: Sparkles },
  { id: "opened", label: "Opened", icon: Eye },
  { id: "clicked", label: "Clicked", icon: MousePointerClick },
  { id: "replied", label: "Replied", icon: MessageSquare },
  { id: "demo_booked", label: "Demo Booked", icon: CalendarClock },
  { id: "meeting_held", label: "Meeting Held", icon: Users },
  { id: "won", label: "Won", icon: Trophy },
  { id: "lost", label: "Lost", icon: XCircle },
];

function columnFor(lead: CrmLead): Column {
  if (lead.pipeline_stage === "won") return "won";
  if (lead.pipeline_stage === "lost") return "lost";
  if (lead.pipeline_stage === "meeting_held") return "meeting_held";
  if (lead.pipeline_stage === "demo_booked") return "demo_booked";
  if (lead.replied_at) return "replied";
  if (lead.email_clicked) return "clicked";
  if (lead.email_opened) return "opened";
  return "new";
}

export default function CrmPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CrmLead | null>(null);

  const { data: leads = [], isLoading } = useQuery<CrmLead[]>({
    queryKey: ["crm-leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // RLS already scopes this to campaigns the caller owns (or all of
      // them, for owner/admin) — no extra filtering needed here.
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, first_name, last_name, full_name, email, company, job_title, location, phone, website, linkedin_url, email_opened, email_clicked, replied_at, reply_text, pipeline_stage, demo_booked_at, meeting_held_at, closed_at, synced_to_odoo, campaign_id, campaigns(name)",
        )
        .eq("org_id", orgId!)
        .order("replied_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as CrmLead[];
    },
  });

  const byColumn = useMemo(() => {
    const grouped: Record<Column, CrmLead[]> = {
      new: [],
      opened: [],
      clicked: [],
      replied: [],
      demo_booked: [],
      meeting_held: [],
      won: [],
      lost: [],
    };
    for (const lead of leads) {
      grouped[columnFor(lead)].push(lead);
    }
    return grouped;
  }, [leads]);

  const handleChanged = () => {
    qc.invalidateQueries({ queryKey: ["crm-leads", orgId] });
    setSelected(null);
  };

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">Pipeline</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          {leads.length}
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((col) => (
          <div key={col.id} className="w-64 shrink-0 space-y-3">
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
                    {lead.campaigns?.name && (
                      <Badge variant="secondary" className="mt-2">
                        {lead.campaigns.name}
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <LeadDetail lead={selected} onClose={() => setSelected(null)} onChanged={handleChanged} />
      )}
    </div>
  );
}

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: "todo" | "in_progress" | "done";
  assigned_to: string | null;
  assignee: { full_name: string | null; email: string | null } | null;
}

function LeadDetail({
  lead,
  onClose,
  onChanged,
}: {
  lead: CrmLead;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [saving, setSaving] = useState<PipelineStage | null>(null);
  const [showBookDemo, setShowBookDemo] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [taskTitle, setTaskTitle] = useState(
    `Prepare demo for ${lead.company || lead.full_name || "this lead"}`,
  );
  const [taskNotes, setTaskNotes] = useState("");

  const column = columnFor(lead);
  const isClosed = column === "won" || column === "lost";

  const { data: techUsers = [] } = useQuery<{ id: string; full_name: string | null; email: string | null }[]>({
    queryKey: ["tech-team", orgId],
    enabled: !!orgId && showBookDemo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email")
        .eq("org_id", orgId!)
        .eq("role", "tech");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: task } = useQuery<TaskRow | null>({
    queryKey: ["lead-task", lead.id],
    enabled: column === "demo_booked" || column === "meeting_held",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, notes, status, assigned_to, assignee:users!assigned_to(full_name, email)")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as TaskRow) ?? null;
    },
  });

  const setStage = async (stage: PipelineStage, extra?: Record<string, unknown>) => {
    setSaving(stage);
    try {
      const { data, error } = await supabase.functions.invoke("crm-action", {
        body: { lead_id: lead.id, stage, ...extra },
      });
      if (error) throw new Error(error.message || "Failed to update deal");
      if (data?.error) throw new Error(data.error);
      const labels: Record<PipelineStage, string> = {
        demo_booked: "Demo booked and task assigned",
        meeting_held: "Marked meeting as held",
        won: `Marked as won${data?.odoo_synced ? " and synced to Odoo" : ""}`,
        lost: "Marked as lost",
      };
      toast.success(labels[stage]);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update deal");
    } finally {
      setSaving(null);
    }
  };

  const handleBookDemo = () => {
    if (!assigneeId) {
      toast.error("Pick a Tech Team member to assign this to");
      return;
    }
    setStage("demo_booked", {
      assignee_id: assigneeId,
      task_title: taskTitle.trim() || undefined,
      task_notes: taskNotes.trim() || undefined,
    });
  };

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

          {(column === "demo_booked" || column === "meeting_held") && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tech Team Task
              </h4>
              {task ? (
                <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    {task.title}
                  </div>
                  {task.notes && <p className="text-muted-foreground">{task.notes}</p>}
                  <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <span>
                      Assigned to {task.assignee?.full_name ?? task.assignee?.email ?? "—"}
                    </span>
                    <Badge
                      variant={task.status === "done" ? "success" : "secondary"}
                      className="capitalize"
                    >
                      {task.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Loading task…</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Odoo CRM
            </h4>
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

          {isClosed ? (
            <Badge variant={column === "won" ? "success" : "outline"} className="text-sm">
              {column === "won" ? "Won" : "Lost"}
              {lead.closed_at && ` · ${format(new Date(lead.closed_at), "MMM d, yyyy")}`}
            </Badge>
          ) : !lead.replied_at ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Deal Outcome
              </h4>
              <p className="text-xs text-muted-foreground">
                This lead hasn't replied yet — outcomes can only be set after a reply.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Move Deal Forward
              </h4>

              {column === "replied" && !showBookDemo && (
                <Button onClick={() => setShowBookDemo(true)} className="w-full">
                  <CalendarClock className="h-4 w-4" />
                  Book Demo
                </Button>
              )}

              {showBookDemo && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="space-y-1.5">
                    <Label>Assign to Tech Team</Label>
                    <Select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                    >
                      <option value="">
                        {techUsers.length === 0 ? "No Tech Team members yet" : "Select a person…"}
                      </option>
                      {techUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name ?? u.email}
                        </option>
                      ))}
                    </Select>
                    {techUsers.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Invite someone with the "Tech" role from Team settings first.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Task title</Label>
                    <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes (optional)</Label>
                    <textarea
                      value={taskNotes}
                      onChange={(e) => setTaskNotes(e.target.value)}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      placeholder="Anything the Tech Team should know…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleBookDemo}
                      disabled={!!saving || techUsers.length === 0}
                      className="flex-1"
                    >
                      {saving === "demo_booked" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                      Confirm
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowBookDemo(false)}
                      disabled={!!saving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {column === "demo_booked" && (
                <Button
                  onClick={() => setStage("meeting_held")}
                  disabled={!!saving}
                  variant="outline"
                  className="w-full"
                >
                  {saving === "meeting_held" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  Mark Meeting Held
                </Button>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => setStage("won")}
                  disabled={!!saving}
                  className="flex-1"
                >
                  {saving === "won" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trophy className="h-4 w-4" />
                  )}
                  Mark Won
                </Button>
                <Button
                  onClick={() => setStage("lost")}
                  disabled={!!saving}
                  variant="outline"
                  className="flex-1"
                >
                  {saving === "lost" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Mark Lost
                </Button>
              </div>
            </div>
          )}
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
