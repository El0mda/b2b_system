export interface LushaFilterOption {
  id: string;
  name: string;
  count?: number;
}

export interface LushaFilters {
  /**
   * Specific people by name, for finding one person rather than a
   * segment. Lusha's own filter set is segment-shaped, so the proxy
   * drops this and says so if the API won't take it.
   */
  contact_names?: string[];
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

export interface LushaProspect {
  id: string;
  contactId: string;
  // Lusha's search-then-enrich pattern ties a contactId to the specific
  // search call that returned it — enrich must be called with the matching
  // requestId, so each prospect carries the id of the page it came from
  // (searches spanning multiple pages to backfill duplicates get a fresh
  // requestId per page).
  requestId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  company: string;
  website: string;
  location: string;
  linkedinUrl: string;
  email?: string;
  phone?: string;
  hasEmail: boolean;
  hasPhone: boolean;
  industry: string;
  companySize: string;
  revenue: string;
}

export interface LushaFilterOptions {
  industries: LushaFilterOption[];
  companySizes: LushaFilterOption[];
  revenues: LushaFilterOption[];
  departments: LushaFilterOption[];
  seniorities: LushaFilterOption[];
  dataPoints: LushaFilterOption[];
}

export const DATA_POINT_OPTIONS = [
  { id: "first_name", name: "First Name" },
  { id: "last_name", name: "Last Name" },
  { id: "email", name: "Email" },
  { id: "phone", name: "Phone" },
  { id: "company", name: "Company" },
  { id: "job_title", name: "Job Title" },
  { id: "location", name: "Location" },
  { id: "industry", name: "Industry" },
  { id: "company_size", name: "Company Size" },
  { id: "linkedin_url", name: "LinkedIn URL" },
];

/** A blank search: every filter off, the wizard's long-standing default
 * of 100 leads (fetched 50 per page — Lusha's hard maximum). */
export const DEFAULT_LUSHA_FILTERS: LushaFilters = {
  contact_names: [],
  company_name: "",
  industry: "",
  company_sizes: [],
  location: "",
  revenue: "",
  technologies: [],
  job_titles: [],
  departments: [],
  seniorities: [],
  contact_location: "",
  data_points: [],
  max_leads: 100,
};
