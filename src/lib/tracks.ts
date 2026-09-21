// Campaign tracks: several sequences in one campaign, each written for a
// different audience, with every lead routed to the one that fits.
//
// A track is a sequence plus the job positions it's meant for. When a
// campaign has several, each lead's job title is matched against them;
// SmartLead only allows one sequence per campaign, so at launch every
// track becomes its own SmartLead campaign (migration 0022).
import type { SequenceStep } from "@/lib/sequence-presets";

export interface WizardTrack {
  /** Local id, only meaningful inside the wizard. */
  key: string;
  name: string;
  jobPositions: string[];
  steps: SequenceStep[];
  /** Library selection this track was loaded from — picker state only. */
  verticalKey: string;
  presetKey: string;
  /** Saved template it came from, when it came from one. */
  templateId: string | null;
}

export function newTrackKey(): string {
  return crypto.randomUUID();
}

/**
 * Lowercases, turns punctuation into spaces and splits into words, so
 * "Sr. HR-Manager" and "sr hr manager" compare equal.
 */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Does this job title fall under this position?
 *
 * Matches whole words in order, not raw substrings: "HR Manager" matches
 * "Senior HR Manager" and "HR" matches "Head of HR", but "HR" must not
 * match "Synchronization Engineer" just because the letters appear.
 */
export function titleMatchesPosition(title: string, position: string): boolean {
  const t = words(title);
  const p = words(position);
  if (p.length === 0 || t.length < p.length) return false;
  for (let i = 0; i <= t.length - p.length; i++) {
    let hit = true;
    for (let j = 0; j < p.length; j++) {
      if (t[i + j] !== p[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/** The first track (in list order) whose positions match the title. */
export function matchTrack(
  title: string | null | undefined,
  tracks: Pick<WizardTrack, "key" | "jobPositions">[],
): string | null {
  if (!title) return null;
  for (const track of tracks) {
    if (track.jobPositions.some((p) => titleMatchesPosition(title, p))) return track.key;
  }
  return null;
}

/** Stable identity for a lead inside the wizard. */
export function leadKey(lead: { email: string }): string {
  return lead.email.trim().toLowerCase();
}

export interface Assignment {
  /** lead key → track key, or null when the lead is left out. */
  byLead: Map<string, string | null>;
  /** track key → number of leads. */
  counts: Map<string, number>;
  /** Leads whose title matched no track (before the default applies). */
  unmatched: number;
  /** Leads that end up in no track at all. */
  excluded: number;
}

/**
 * Routes every lead to a track.
 *
 * Order of precedence: a manual override, then the first matching
 * track, then the default track — or nothing, when the default is
 * "leave them out" (defaultKey null).
 *
 * With a single track everything goes to it: one sequence needs no
 * routing, and requiring job positions there would break the ordinary
 * single-sequence campaign.
 */
export function assignLeads(
  leads: Array<{ email: string; job_title?: string | null }>,
  tracks: Pick<WizardTrack, "key" | "jobPositions">[],
  defaultKey: string | null,
  overrides: Record<string, string>,
): Assignment {
  const byLead = new Map<string, string | null>();
  const counts = new Map<string, number>(tracks.map((t) => [t.key, 0]));
  const trackKeys = new Set(tracks.map((t) => t.key));
  let unmatched = 0;
  let excluded = 0;

  for (const lead of leads) {
    const key = leadKey(lead);
    let chosen: string | null;

    if (tracks.length === 1) {
      chosen = tracks[0].key;
    } else if (overrides[key] && trackKeys.has(overrides[key])) {
      chosen = overrides[key];
    } else {
      chosen = matchTrack(lead.job_title, tracks);
      if (!chosen) {
        unmatched++;
        chosen = defaultKey && trackKeys.has(defaultKey) ? defaultKey : null;
      }
    }

    byLead.set(key, chosen);
    if (chosen) counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
    else excluded++;
  }

  return { byLead, counts, unmatched, excluded };
}
