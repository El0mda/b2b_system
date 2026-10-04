// Campaign tracks: several sequences in one campaign, each written for a
// different audience, with every lead routed to the one that fits.
//
// A track is a sequence plus the audience it's meant for: job positions
// ("HR Manager"), whole departments ("Human Resources"), or both. When a
// campaign has several, each lead is matched against them; SmartLead only
// allows one sequence per campaign, so at launch every track becomes its
// own SmartLead campaign (migration 0022).
//
// How a title is matched lives in lib/job-match.ts.
import type { SequenceStep } from "@/lib/sequence-presets";
import { departmentName, leadMatchesDepartments, titleMatchesPosition } from "@/lib/job-match";

export { titleMatchesPosition } from "@/lib/job-match";

export interface WizardTrack {
  /** Local id, only meaningful inside the wizard. */
  key: string;
  name: string;
  jobPositions: string[];
  /** Department keys from lib/job-match.ts — a whole function at once. */
  departments: string[];
  steps: SequenceStep[];
  /** Library selection this track was loaded from — picker state only. */
  verticalKey: string;
  presetKey: string;
  /** Saved template it came from, when it came from one. */
  templateId: string | null;
}

/** Who a sequence is for, in words: its positions and its departments. */
export function describeAudience(
  track: Pick<WizardTrack, "jobPositions" | "departments">,
): string {
  return [
    ...track.jobPositions,
    ...(track.departments ?? []).map((d) => `${departmentName(d)} dept`),
  ].join(", ");
}

export function newTrackKey(): string {
  return crypto.randomUUID();
}

export type MatchableTrack = Pick<WizardTrack, "key" | "jobPositions" | "departments">;
export type MatchableLead = { job_title?: string | null; department?: string | null };

/**
 * The track this lead belongs in, or null when none fits.
 *
 * Job positions are tried across every track before departments, because
 * a named position is the more specific statement of intent: given one
 * sequence for the whole of Human Resources and another for HR Managers,
 * an HR Manager should get the manager one no matter which was added
 * first. Within each pass the earlier track wins.
 */
export function matchTrack(
  lead: MatchableLead,
  tracks: MatchableTrack[],
): string | null {
  const title = lead.job_title;
  if (title) {
    for (const track of tracks) {
      if (track.jobPositions.some((p) => titleMatchesPosition(title, p))) return track.key;
    }
  }
  for (const track of tracks) {
    if (leadMatchesDepartments(lead, track.departments ?? [])) return track.key;
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
 * Order of precedence: a manual override, then the matching track (see
 * matchTrack), then the default track — or nothing, when the default is
 * "leave them out" (defaultKey null).
 *
 * With a single track everything goes to it: one sequence needs no
 * routing, and requiring job positions there would break the ordinary
 * single-sequence campaign.
 */
export function assignLeads(
  leads: Array<{ email: string; job_title?: string | null; department?: string | null }>,
  tracks: MatchableTrack[],
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
      chosen = matchTrack(lead, tracks);
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
