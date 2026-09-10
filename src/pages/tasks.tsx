// Every call a sequence has asked for, in one list. The bell handles
// what's due this minute; this is where you work through a backlog, see
// what's coming, and check what's already been done.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { PhoneCall, Check, Clock, SkipForward, Search, CheckCircle2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FullPageSpinner } from "@/components/ui/spinner";
import {
  isDue,
  leadName,
  useCallTaskActions,
  useCallTasks,
  useNow,
  type CallTask,
} from "@/lib/call-tasks";
import { cn } from "@/lib/utils";

type Filter = "due" | "upcoming" | "done" | "all";

export default function TasksPage() {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const now = useNow();
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";

  const [filter, setFilter] = useState<Filter>("due");
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(true);

  const { data: tasks = [], isLoading } = useCallTasks(orgId, {
    mineOnly,
    userId: profile?.id ?? null,
    includeDone: true,
  });
  const { complete, skip, snooze } = useCallTaskActions(orgId);

  const counts = useMemo(() => {
    let due = 0;
    let upcoming = 0;
    let done = 0;
    for (const t of tasks) {
      if (t.status !== "pending") done++;
      else if (isDue(t, now)) due++;
      else upcoming++;
    }
    return { due, upcoming, done };
  }, [tasks, now]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter === "due" && !(t.status === "pending" && isDue(t, now))) return false;
      if (filter === "upcoming" && !(t.status === "pending" && !isDue(t, now))) return false;
      if (filter === "done" && t.status === "pending") return false;
      if (q) {
        const haystack = [
          t.title,
          leadName(t),
          t.leads?.company ?? "",
          t.campaigns?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filter, search, now]);

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Call tasks</h2>
          <p className="text-sm text-muted-foreground">
            Created by the call steps in your sequences. Reminders keep coming until each one is
            done or skipped.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={mineOnly} onCheckedChange={setMineOnly} aria-label="Only my tasks" />
            Only mine
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Due now" value={counts.due} tone="due" onClick={() => setFilter("due")} />
        <StatCard label="Upcoming" value={counts.upcoming} onClick={() => setFilter("upcoming")} />
        <StatCard label="Completed" value={counts.done} onClick={() => setFilter("done")} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search lead, company, campaign…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="due">Due now</option>
              <option value="upcoming">Upcoming</option>
              <option value="done">Completed</option>
              <option value="all">All</option>
            </Select>
          </div>

          <div>
            {visible.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted-foreground">
                Nothing here.
              </p>
            ) : (
              visible.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  onDone={() => complete.mutate({ id: task.id })}
                  onSkip={() => skip.mutate(task.id)}
                  onSnooze={(hours) => snooze.mutate({ id: task.id, hours })}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "due";
  onClick: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <button type="button" onClick={onClick} className="w-full p-5 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-bold",
              tone === "due" && value > 0 && "text-amber-600 dark:text-amber-400",
            )}
          >
            {value}
          </p>
        </button>
      </CardContent>
    </Card>
  );
}

function TaskRow({
  task,
  now,
  onDone,
  onSkip,
  onSnooze,
}: {
  task: CallTask;
  now: number;
  onDone: () => void;
  onSkip: () => void;
  onSnooze: (hours: number) => void;
}) {
  const dueDate = new Date(task.due_at);
  const overdue = task.status === "pending" && dueDate.getTime() <= now;
  const snoozed =
    task.status === "pending" &&
    task.snoozed_until &&
    new Date(task.snoozed_until).getTime() > now;

  return (
    <div className="flex flex-wrap items-start gap-4 border-b border-border p-4 last:border-b-0">
      <PhoneCall
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          task.status !== "pending"
            ? "text-muted-foreground/40"
            : overdue
              ? "text-amber-500"
              : "text-muted-foreground",
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "font-medium",
              task.status !== "pending" && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </p>
          {task.status === "done" && (
            <Badge variant="success">
              <CheckCircle2 className="h-3 w-3" /> Done
            </Badge>
          )}
          {task.status === "skipped" && <Badge variant="secondary">Skipped</Badge>}
          {snoozed && (
            <Badge variant="info">
              <Clock className="h-3 w-3" /> Snoozed
            </Badge>
          )}
        </div>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {task.lead_id ? (
            <Link to="/leads" className="hover:underline">
              {leadName(task)}
            </Link>
          ) : (
            leadName(task)
          )}
          {task.leads?.company ? ` · ${task.leads.company}` : ""}
          {task.campaigns?.name ? ` · ${task.campaigns.name}` : ""}
        </p>

        {task.notes && (
          <p className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            {task.notes}
          </p>
        )}

        <p className={cn("mt-1 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          {task.status === "pending"
            ? `Due ${formatDistanceToNow(dueDate, { addSuffix: true })} · ${format(dueDate, "MMM d, HH:mm")}`
            : task.completed_at
              ? `Closed ${format(new Date(task.completed_at), "MMM d, HH:mm")}`
              : format(dueDate, "MMM d, HH:mm")}
        </p>

        {task.leads?.phone && (
          <a
            href={`tel:${task.leads.phone}`}
            className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
          >
            {task.leads.phone}
          </a>
        )}
      </div>

      {task.status === "pending" && (
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={onDone}>
            <Check className="h-3.5 w-3.5" /> Done
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onSnooze(1)}>
            <Clock className="h-3.5 w-3.5" /> 1h
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onSnooze(24)}>
            Tomorrow
          </Button>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </Button>
        </div>
      )}
    </div>
  );
}
