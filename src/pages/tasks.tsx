import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ClipboardList, CheckCircle2, PlayCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FullPageSpinner } from "@/components/ui/spinner";

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: "todo" | "in_progress" | "done";
  created_at: string;
  completed_at: string | null;
  assigned_to: string | null;
  assignee: { full_name: string | null; email: string | null } | null;
  lead: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
}

const STATUS_BADGE: Record<TaskRow["status"], "secondary" | "info" | "success"> = {
  todo: "secondary",
  in_progress: "info",
  done: "success",
};

export default function TasksPage() {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const scopeToAll = isAdmin && showAll;

  const { data: tasks = [], isLoading } = useQuery<TaskRow[]>({
    queryKey: ["tasks", orgId, profile?.id, scopeToAll],
    enabled: !!orgId && !!profile?.id,
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select(
          "id, title, notes, status, created_at, completed_at, assigned_to, assignee:users!assigned_to(full_name, email), lead:leads(full_name, first_name, last_name, company)",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (!scopeToAll) query = query.eq("assigned_to", profile!.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
  });

  const updateStatus = async (task: TaskRow, status: TaskRow["status"]) => {
    setUpdating(task.id);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", task.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["tasks", orgId] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to update task");
    } finally {
      setUpdating(null);
    }
  };

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Tasks</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {tasks.length}
          </span>
        </div>
        {isAdmin && (
          <div className="flex gap-1 rounded-md border border-border p-1">
            <Button
              size="sm"
              variant={showAll ? "ghost" : "secondary"}
              onClick={() => setShowAll(false)}
            >
              My Tasks
            </Button>
            <Button
              size="sm"
              variant={showAll ? "secondary" : "ghost"}
              onClick={() => setShowAll(true)}
            >
              All Tasks
            </Button>
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {scopeToAll
                ? "No tasks have been created yet."
                : "No tasks assigned to you right now."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const leadName =
              task.lead?.full_name ||
              `${task.lead?.first_name ?? ""} ${task.lead?.last_name ?? ""}`.trim() ||
              null;
            return (
              <Card key={task.id}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{task.title}</p>
                      <Badge variant={STATUS_BADGE[task.status]} className="capitalize">
                        {task.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {task.notes && (
                      <p className="text-sm text-muted-foreground">{task.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {leadName && task.lead?.company
                        ? `${leadName} · ${task.lead.company}`
                        : leadName || task.lead?.company || "No linked lead"}
                      {" · "}
                      <Link to="/crm" className="underline hover:text-foreground">
                        View in Pipeline
                      </Link>
                    </p>
                    {scopeToAll && (
                      <p className="text-xs text-muted-foreground">
                        Assigned to {task.assignee?.full_name ?? task.assignee?.email ?? "—"}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created {format(new Date(task.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {task.status === "todo" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updating === task.id}
                        onClick={() => updateStatus(task, "in_progress")}
                      >
                        {updating === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                        Start
                      </Button>
                    )}
                    {task.status !== "done" && (
                      <Button
                        size="sm"
                        disabled={updating === task.id}
                        onClick={() => updateStatus(task, "done")}
                      >
                        {updating === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Mark Done
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
