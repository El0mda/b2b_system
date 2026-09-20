// How, when and how fast a campaign sends.
//
// These are the settings that decide whether outreach reads as a person
// typing or as a machine blasting — the single biggest lever on landing
// in the inbox rather than spam. They used to be hardcoded in the
// send-campaign function; now each campaign carries its own.
//
// The same shape is stored on campaigns.send_settings (migration 0021)
// and re-read by the edge function at launch.

export interface CampaignSendSettings {
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** "HH:MM", 24-hour, in the campaign's timezone. */
  startHour: string;
  endHour: string;
  /** Minimum minutes between two emails from the same mailbox. */
  minGapMinutes: number;
  /** New leads entered into the campaign per day. */
  maxLeadsPerDay: number;
  trackOpens: boolean;
  trackClicks: boolean;
  /** Stop the rest of the sequence once someone replies. */
  stopOnReply: boolean;
  /** Strip HTML — plain text looks more like a real person's email. */
  plainText: boolean;
}

// Deliberately more conservative than the old hardcoded values (50 leads
// a day, 10 minutes apart). A single warmed SmartLead mailbox defaults
// to ~25 sends a day; going past what the mailbox allows doesn't send
// faster, it just queues — and volume is what gets a domain flagged.
export const DEFAULT_SEND_SETTINGS: CampaignSendSettings = {
  days: [1, 2, 3, 4, 5],
  startHour: "09:00",
  endHour: "17:00",
  minGapMinutes: 15,
  maxLeadsPerDay: 25,
  trackOpens: true,
  trackClicks: true,
  stopOnReply: true,
  plainText: false,
};

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesOfDay(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Anything that would make SmartLead reject the schedule, or make the
 * campaign silently never send. Returns [] when the settings are usable.
 */
export function validateSendSettings(s: CampaignSendSettings): string[] {
  const problems: string[] = [];
  if (s.days.length === 0) problems.push("Pick at least one sending day.");
  if (!HHMM.test(s.startHour) || !HHMM.test(s.endHour)) {
    problems.push("Start and end time must be in 24-hour HH:MM format.");
  } else if (minutesOfDay(s.endHour) <= minutesOfDay(s.startHour)) {
    problems.push("The end time has to be later than the start time.");
  }
  if (s.minGapMinutes < 1) problems.push("Leave at least 1 minute between emails.");
  if (s.maxLeadsPerDay < 1) problems.push("Send to at least 1 new lead per day.");
  return problems;
}

/**
 * How many emails the window can actually fit, which is what really
 * caps a day — not the lead limit. Surfacing this stops someone setting
 * 200 leads/day in a 2-hour window and wondering why it crawls.
 */
export function emailsPerWindow(s: CampaignSendSettings): number {
  const span = minutesOfDay(s.endHour) - minutesOfDay(s.startHour);
  if (span <= 0 || s.minGapMinutes <= 0) return 0;
  return Math.floor(span / s.minGapMinutes);
}

// Tolerant read of the JSONB column: a campaign saved before this
// existed has {}, and falls back to the defaults.
export function parseSendSettings(value: unknown): CampaignSendSettings {
  const v = (value ?? {}) as Record<string, unknown>;
  const d = DEFAULT_SEND_SETTINGS;
  const days = Array.isArray(v.days)
    ? v.days.filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6)
    : d.days;
  return {
    days: days.length > 0 ? days : d.days,
    startHour: typeof v.startHour === "string" && HHMM.test(v.startHour) ? v.startHour : d.startHour,
    endHour: typeof v.endHour === "string" && HHMM.test(v.endHour) ? v.endHour : d.endHour,
    minGapMinutes: typeof v.minGapMinutes === "number" ? v.minGapMinutes : d.minGapMinutes,
    maxLeadsPerDay: typeof v.maxLeadsPerDay === "number" ? v.maxLeadsPerDay : d.maxLeadsPerDay,
    trackOpens: typeof v.trackOpens === "boolean" ? v.trackOpens : d.trackOpens,
    trackClicks: typeof v.trackClicks === "boolean" ? v.trackClicks : d.trackClicks,
    stopOnReply: typeof v.stopOnReply === "boolean" ? v.stopOnReply : d.stopOnReply,
    plainText: typeof v.plainText === "boolean" ? v.plainText : d.plainText,
  };
}

export function describeDays(days: number[]): string {
  if (days.length === 0) return "No days selected";
  const sorted = [...days].sort((a, b) => a - b);
  const isWeekdays = sorted.join(",") === "1,2,3,4,5";
  if (isWeekdays) return "Weekdays";
  if (sorted.length === 7) return "Every day";
  return sorted.map((d) => DAY_LABELS[d]).join(", ");
}
