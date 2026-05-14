export interface LushaFilterOption {
  id: string;
  name: string;
  count?: number;
}

export interface LushaFilters {
  company_name?: string;
  industry?: string;
  company_sizes?: string[];
  location?: string;
  revenue?: string;
  technologies?: string[];
  job_titles?: string[];
  department?: string;
  seniorities?: string[];
  contact_location?: string;
  data_points?: string[];
  max_leads: number;
}

export interface LushaProspect {
  id: string;
  contactId: string;
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
