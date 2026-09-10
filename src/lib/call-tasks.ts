// Call reminders: the app-side half of a sequence's call steps.
//
// SmartLead runs the email steps; a call step has no automation behind
// it at all, only a person who has to remember. So each one becomes a
// row in public.call_tasks and this module is what makes sure nobody
// gets to ignore it quietly — it polls for what's due, nags on a timer,
// and only stops when the task is marked done.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";

export interface CallTask {
  id: string;
  title: string;
  notes: string | null;
  due_at: string;
  snoozed_until: string | null;
  status: string;
  step: number | null;
  assigned_to: string | null;
  completed_at: string | null;
  outcome: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  leads: {
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  campaigns: { name: string } | null;
}

const SELECT =
  "id, title, notes, due_at, snoozed_until, status, step, assigned_to, completed_at, outcome, " +
  "campaign_id, lead_id, leads(first_name, last_name, full_name, company, phone, email), " +
  "campaigns(name)";

// How often the browser asks the server for new work, and how often it
// re-nags about work that's still sitting there. Polling beats realtime
// here: a task becomes due by the clock passing, which no database event
// would announce anyway.
const POLL_MS = 60_000;
const RENAG_MS = 30 * 60_000;

export function isDue(task: CallTask, now: number): boolean {
  if (task.status !== "pending") return false;
  if (task.snoozed_until && new Date(task.snoozed_until).getTime() > now) return false;
  return new Date(task.due_at).getTime() <= now;
}

export function leadName(task: CallTask): string {
  const lead = task.leads;
  if (!lead) return "this lead";
  const composed = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
  return lead.full_name || composed || lead.email || "this lead";
}

// A clock that re-renders on an interval, so "3 hours overdue" doesn't
// sit frozen at whatever it said when the component mounted.
export function useNow(intervalMs = POLL_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useCallTasks(
  orgId: string | undefined,
  opts: { mineOnly?: boolean; userId?: string | null; includeDone?: boolean } = {},
) {
  const { mineOnly = false, userId = null, includeDone = false } = opts;
  return useQuery<CallTask[]>({
    queryKey: ["call-tasks", orgId, mineOnly ? userId : "all", includeDone],
    enabled: !!orgId,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let q = supabase.from("call_tasks").select(SELECT).eq("org_id", orgId!);
      // RLS already hides other people's tasks from a member; this
      // narrows an owner/admin's view to their own for the reminder bell.
      if (mineOnly && userId) q = q.eq("assigned_to", userId);
      if (!includeDone) q = q.eq("status", "pending");
      const { data, error } = await q.order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CallTask[];
    },
  });
}

export function useCallTaskActions(orgId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["call-tasks", orgId] });

  const complete = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome?: string }) => {
      const { error } = await supabase
        .from("call_tasks")
        .update({
          status: "done",
          outcome: outcome ?? null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Call marked done");
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't update the task"),
  });

  const skip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("call_tasks")
        .update({ status: "skipped", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Call skipped");
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't update the task"),
  });

  // Snoozing keeps the task pending — it just drops out of the due list
  // until the clock catches up, and then the nagging resumes.
  const snooze = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number }) => {
      const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("call_tasks")
        .update({ snoozed_until: until, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, { hours }) => {
      invalidate();
      toast.success(hours >= 24 ? "Reminder set for tomorrow" : `Reminder set for ${hours}h`);
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't snooze the task"),
  });

  return { complete, skip, snooze };
}

// Desktop notifications need a user gesture to ask for permission, so
// this is wired to a button rather than fired on load.
export async function enableDesktopReminders(): Promise<boolean> {
  if (typeof Notification === "undefined") {
    toast.error("This browser doesn't support desktop notifications");
    return false;
  }
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  if (result === "granted") {
    toast.success("Desktop reminders on");
    return true;
  }
  toast.error("Desktop reminders blocked in your browser settings");
  return false;
}

export function desktopRemindersEnabled(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/**
 * The nagging itself. Fires once per task the moment it comes due, then
 * re-nags with a running total every RENAG_MS for as long as anything is
 * still pending, and keeps the overdue count in the tab title so it's
 * visible from another tab.
 */
export function useCallReminders(tasks: CallTask[], onOpen: () => void) {
  const now = useNow();
  const alerted = useRef<Set<string>>(new Set());
  const lastNag = useRef<number>(Date.now());

  const due = useMemo(() => tasks.filter((t) => isDue(t, now)), [tasks, now]);

  const notify = useCallback((title: string, body: string) => {
    toast(title, { description: body, duration: 10_000, action: { label: "View", onClick: onOpen } });
    if (desktopRemindersEnabled()) {
      try {
        new Notification(title, { body, tag: "call-reminder" });
      } catch {
        // Some browsers refuse the constructor outside a service worker;
        // the toast above already carried the message.
      }
    }
  }, [onOpen]);

  useEffect(() => {
    // Newly due tasks get announced individually.
    const fresh = due.filter((t) => !alerted.current.has(t.id));
    for (const task of fresh.slice(0, 3)) {
      alerted.current.add(task.id);
      notify(task.title, `${leadName(task)}${task.leads?.company ? ` · ${task.leads.company}` : ""}`);
    }
    if (fresh.length > 3) {
      fresh.slice(3).forEach((t) => alerted.current.add(t.id));
      notify(`${fresh.length} calls are due`, "Open your reminders to work through them.");
    }
    if (fresh.length > 0) lastNag.current = Date.now();

    // Anything still sitting there gets brought up again on a timer —
    // that's the "keep reminding me" part.
    if (due.length > 0 && Date.now() - lastNag.current >= RENAG_MS) {
      lastNag.current = Date.now();
      notify(
        `${due.length} call${due.length === 1 ? "" : "s"} still waiting`,
        "Mark them done or snooze them to stop the reminders.",
      );
    }

    // A task that got done or snoozed elsewhere should be able to alert
    // again if it ever comes back around.
    const dueIds = new Set(due.map((t) => t.id));
    for (const id of alerted.current) if (!dueIds.has(id)) alerted.current.delete(id);
  }, [due, notify]);

  // Tab title badge, restored on unmount so it can't leak into another page.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = due.length > 0 ? `(${due.length}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [due.length]);

  return due;
}
