// Replaces {{first_name}} / {{last_name}} / {{company}} / {{title}} / {{location}}
// in subject/body strings with values from a lead record.

export interface TemplateLead {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  location?: string | null;
  email?: string | null;
}

const FIELDS: Array<{ token: string; pick: (l: TemplateLead) => string }> = [
  { token: "first_name", pick: (l) => l.first_name ?? l.full_name?.split(" ")[0] ?? "" },
  {
    token: "last_name",
    pick: (l) => l.last_name ?? l.full_name?.split(" ").slice(1).join(" ") ?? "",
  },
  { token: "full_name", pick: (l) => l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() },
  { token: "company", pick: (l) => l.company ?? "" },
  { token: "title", pick: (l) => l.job_title ?? "" },
  { token: "job_title", pick: (l) => l.job_title ?? "" },
  { token: "location", pick: (l) => l.location ?? "" },
  { token: "email", pick: (l) => l.email ?? "" },
];

export function processTemplate(template: string, lead: TemplateLead): string {
  let out = template;
  for (const f of FIELDS) {
    const re = new RegExp(`\\{\\{\\s*${f.token}\\s*\\}\\}`, "gi");
    out = out.replace(re, f.pick(lead));
  }
  return out;
}

export const PERSONALIZATION_TOKENS = [
  "first_name",
  "last_name",
  "company",
  "title",
  "location",
] as const;
