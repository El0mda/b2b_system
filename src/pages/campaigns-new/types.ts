import type { SequenceStep } from "@/lib/sequence-presets";

export type WizardStepKey = "configure" | "source" | "review" | "sequences" | "launch";

export interface WizardLead {
  id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company?: string;
  job_title?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  website?: string;
  nb_result?: string | null;
  email_valid?: boolean | null;
  has_work_email?: boolean;
  has_phones?: boolean;
}

export interface SenderOption {
  id: string;
  sender_name: string;
  sender_email: string;
  reply_to_email: string | null;
  is_default: boolean | null;
}

export interface LushaFilters {
  company_name?: string;
  industry?: string;
  company_sizes?: string[];
  location?: string;
  revenue?: string;
  technologies?: string[];
  job_titles?: string[];
  departments?: string[];
  seniorities?: string[];
  contact_location?: string;
  data_points?: string[];
  max_leads: number;
}

export interface LushaFilterOption {
  id: string;
  name: string;
  count?: number;
}

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
  sequenceSteps: SequenceStep[];
  presetKey: string;
  campaignId: string | null;
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
