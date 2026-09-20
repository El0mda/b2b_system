// When and how fast a campaign sends, plus the reasoning behind the
// limits. The guidance sits next to the controls on purpose: these are
// the settings that decide whether outreach lands in the inbox, and a
// number with no explanation just gets raised until it breaks.
import { AlertTriangle, ShieldCheck, Clock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DAY_LABELS,
  emailsPerWindow,
  validateSendSettings,
  type CampaignSendSettings,
} from "@/lib/campaign-settings";

export function SendingSchedule({
  value,
  onChange,
  mailboxDailyLimit,
}: {
  value: CampaignSendSettings;
  onChange: (next: CampaignSendSettings) => void;
  /** SmartLead's own per-day cap for the chosen mailbox, when known. */
  mailboxDailyLimit?: number | null;
}) {
  const set = <K extends keyof CampaignSendSettings>(key: K, v: CampaignSendSettings[K]) =>
    onChange({ ...value, [key]: v });

  const toggleDay = (day: number) =>
    set(
      "days",
      value.days.includes(day)
        ? value.days.filter((d) => d !== day)
        : [...value.days, day].sort((a, b) => a - b),
    );

  const problems = validateSendSettings(value);
  const capacity = emailsPerWindow(value);
  // The sending window can cap the day harder than the lead limit does.
  const windowLimited = capacity > 0 && capacity < value.maxLeadsPerDay;
  const overMailbox =
    typeof mailboxDailyLimit === "number" && value.maxLeadsPerDay > mailboxDailyLimit;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle>Sending schedule</CardTitle>
        </div>
        <CardDescription>
          When this campaign is allowed to send, and how fast. Times are in the campaign's
          timezone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>Working days</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, day) => {
              const on = value.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Weekday-only sending is normal business behaviour. Weekend sending is a common spam
            signal for B2B outreach.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="start-hour">Start time</Label>
            <Input
              id="start-hour"
              type="time"
              value={value.startHour}
              onChange={(e) => set("startHour", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-hour">End time</Label>
            <Input
              id="end-hour"
              type="time"
              value={value.endHour}
              onChange={(e) => set("endHour", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="min-gap">Minutes between emails</Label>
            <Input
              id="min-gap"
              type="number"
              min={1}
              value={value.minGapMinutes}
              onChange={(e) => set("minGapMinutes", Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Randomised gaps of 10–20 minutes look human. Sending several a minute does not.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max-leads">New leads per day</Label>
            <Input
              id="max-leads"
              type="number"
              min={1}
              value={value.maxLeadsPerDay}
              onChange={(e) => set("maxLeadsPerDay", Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              {typeof mailboxDailyLimit === "number"
                ? `This mailbox is capped at ${mailboxDailyLimit}/day in SmartLead.`
                : "Keep it under your mailbox's daily limit in SmartLead."}
            </p>
          </div>
        </div>

        {(windowLimited || overMailbox) && (
          <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            {windowLimited && (
              <p className="text-amber-700 dark:text-amber-400">
                Your window fits about <strong>{capacity}</strong> emails a day at{" "}
                {value.minGapMinutes} minutes apart, so {value.maxLeadsPerDay} leads/day won't all
                go out. Widen the hours or shorten the gap.
              </p>
            )}
            {overMailbox && (
              <p className="text-amber-700 dark:text-amber-400">
                SmartLead caps this mailbox at {mailboxDailyLimit}/day — the rest will simply
                queue.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <ToggleRow
            label="Stop the sequence when someone replies"
            hint="Follow-ups after a reply are the fastest way to get marked as spam."
            checked={value.stopOnReply}
            onChange={(v) => set("stopOnReply", v)}
          />
          <ToggleRow
            label="Send as plain text"
            hint="Plain text looks like a normal email and usually delivers better — but photos and videos in your steps won't render."
            checked={value.plainText}
            onChange={(v) => set("plainText", v)}
          />
          <ToggleRow
            label="Track opens"
            hint="Adds an invisible tracking pixel. Improves your stats, slightly hurts deliverability."
            checked={value.trackOpens}
            onChange={(v) => set("trackOpens", v)}
          />
          <ToggleRow
            label="Track link clicks"
            hint="Rewrites your links, which some filters dislike. Turning this off also stops clicks pushing leads to Odoo."
            checked={value.trackClicks}
            onChange={(v) => set("trackClicks", v)}
          />
        </div>

        {problems.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            {problems.map((p) => (
              <p key={p} className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {p}
              </p>
            ))}
          </div>
        )}

        <SpamNotes />
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

// Short, concrete and specific to how this app sends. Generic
// "personalise your emails" advice would be ignored.
function SpamNotes() {
  const notes = [
    "Warm up a new mailbox for about two weeks before its first real campaign. A brand-new address sending 25 a day goes straight to spam.",
    "Verify addresses before sending — bounces damage a domain faster than anything else. The import screen checks them with Emailable.",
    "Spread volume across senders, not into one mailbox. Three reps at 25/day is safe; one mailbox at 75/day is not.",
    "Keep the first email short, plain and without links. Save links and images for later steps, once someone has replied or engaged.",
    "Always include a way out. A campaign with no opt-out gets reported instead of ignored.",
  ];
  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Staying out of spam
        </p>
      </div>
      <ul className="space-y-1.5">
        {notes.map((n) => (
          <li key={n} className="flex gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">•</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
