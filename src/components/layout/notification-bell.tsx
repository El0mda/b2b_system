// The reminder bell: what's due right now, what's coming, and the two
// actions that stop the nagging — done, or snooze.
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Bell, PhoneCall, Check, Clock, BellRing, ArrowRight } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  desktopRemindersEnabled,
  enableDesktopReminders,
  isDue,
  leadName,
  useCallReminders,
  useCallTaskActions,
  useCallTasks,
  useNow,
  type CallTask,
} from "@/lib/call-tasks";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { organization, profile } = useAuth();
  const navigate = useNavigate();
  const now = useNow();

  const { data: tasks = [] } = useCallTasks(organization?.id, {
    mineOnly: true,
    userId: profile?.id ?? null,
  });
  const { complete, snooze } = useCallTaskActions(organization?.id);

  // Drives the toasts, the desktop notifications and the tab-title badge.
  // Stable identity so the reminder effect isn't re-run on every render.
  const openTasks = useCallback(() => navigate("/tasks"), [navigate]);
  const due = useCallReminders(tasks, openTasks);

  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "pending" && !isDue(t, now))
        .slice(0, 5),
    [tasks, now],
  );

  return (
    <DropdownMenu
      className="w-[24rem] max-w-[calc(100vw-2rem)] py-0"
      trigger={
        <button
          type="button"
          className="relative hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
          aria-label={due.length > 0 ? `${due.length} calls due` : "Notifications"}
        >
          {due.length > 0 ? (
            <BellRing className="h-4 w-4 text-amber-500" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {due.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {due.length > 99 ? "99+" : due.length}
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Call reminders</p>
              <p className="text-xs text-muted-foreground">
                {due.length > 0
                  ? `${due.length} due now`
                  : upcoming.length > 0
                    ? "Nothing due — some coming up"
                    : "You're all clear"}
              </p>
            </div>
            {!desktopRemindersEnabled() && (
              <Button variant="ghost" size="sm" onClick={() => enableDesktopReminders()}>
                <BellRing className="h-3.5 w-3.5" /> Desktop
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {due.length === 0 && upcoming.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Call steps in your campaigns show up here when they're due.
              </p>
            )}

            {due.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                overdue
                onDone={() => complete.mutate({ id: task.id })}
                onSnooze={(hours) => snooze.mutate({ id: task.id, hours })}
              />
            ))}

            {upcoming.length > 0 && (
              <>
                <p className="border-y border-border bg-muted/30 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Coming up
                </p>
                {upcoming.map((task) => (
                  <TaskRow key={task.id} task={task} now={now} />
                ))}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              close();
              navigate("/tasks");
            }}
            className="flex items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-muted"
          >
            View all call tasks <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </DropdownMenu>
  );
}

function TaskRow({
  task,
  now,
  overdue,
  onDone,
  onSnooze,
}: {
  task: CallTask;
  now: number;
  overdue?: boolean;
  onDone?: () => void;
  onSnooze?: (hours: number) => void;
}) {
  const dueDate = new Date(task.due_at);
  const when = formatDistanceToNow(dueDate, { addSuffix: true });

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <PhoneCall
          className={cn("mt-0.5 h-4 w-4 shrink-0", overdue ? "text-amber-500" : "text-muted-foreground")}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {leadName(task)}
            {task.leads?.company ? ` · ${task.leads.company}` : ""}
            {task.campaigns?.name ? ` · ${task.campaigns.name}` : ""}
          </p>
          <p
            className={cn(
              "mt-0.5 text-xs",
              overdue && dueDate.getTime() < now ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {dueDate.getTime() <= now ? `Due ${when}` : `Due ${when}`}
          </p>
          {task.leads?.phone && (
            <a
              href={`tel:${task.leads.phone}`}
              className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
            >
              {task.leads.phone}
            </a>
          )}
          {overdue && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={onDone}>
                <Check className="h-3.5 w-3.5" /> Done
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onSnooze?.(1)}>
                <Clock className="h-3.5 w-3.5" /> 1h
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onSnooze?.(24)}>
                Tomorrow
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
