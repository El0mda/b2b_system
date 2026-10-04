import type { WizardTrack } from "@/lib/tracks";
import type { LeadDraft } from "@/lib/leads";
import type { LushaFilters } from "@/lib/lusha";
import type { CampaignSendSettings } from "@/lib/campaign-settings";

export type WizardStepKey = "configure" | "source" | "review" | "sequences" | "launch";

// The wizard's leads are the same drafts the Lusha search and the
// importer produce; the shape lives with them.
export type WizardLead = LeadDraft;

export interface SenderOption {
  id: string;
  sender_name: string;
  sender_email: string;
  reply_to_email: string | null;
  is_default: boolean | null;
}

// Re-exported so the wizard's own files keep importing from here.
export type { LushaFilters, LushaFilterOption } from "@/lib/lusha";

export interface WizardState {
  campaignName: string;
  senderAccountId: string | null;
  sender_email?: string;
  sender_name?: string;
  reply_to_email?: string;
  timezone: string;
  sourceTab: "lusha" | "import";
  leads: WizardLead[];
  selectedLeadIds: Set<string>;
  // The sequences in this campaign, one per audience (see lib/tracks.ts).
  // A single track is the ordinary one-sequence campaign.
  tracks: WizardTrack[];
  activeTrackKey: string | null;
  // Where leads whose title matches no track go; null leaves them out.
  defaultTrackKey: string | null;
  // Lead key (lowercased email) → track key, for leads moved by hand.
  trackOverrides: Record<string, string>;
  campaignId: string | null;
  // When and how fast this campaign sends (see campaign-settings.ts).
  sendSettings: CampaignSendSettings;
  lushaFilters: LushaFilters;
}

export const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Africa/Cairo",
];

export const WIZARD_STEPS: Array<{ key: WizardStepKey; label: string }> = [
  { key: "configure", label: "Configure" },
  { key: "source", label: "Search/Import" },
  { key: "review", label: "Review" },
  { key: "sequences", label: "Sequences" },
  { key: "launch", label: "Launch" },
];
