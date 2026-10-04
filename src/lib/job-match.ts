// Matching leads to sequences by job title and department.
//
// A sequence says who it's for — job positions ("HR Manager"), departments
// ("Human Resources"), or both — and every lead's job title is matched
// against that.
//
// The first version compared whole words in order, so a sequence written
// for "Human Resources Manager" collected nobody when the leads' titles
// said "HR", "Head of People" or "HR Business Partner". Titles are
// written a hundred different ways for the same job, so matching here
// works on meaning rather than spelling:
//
//   * abbreviations are expanded (HR → human resources, CTO → chief
//     technology officer, Sr → senior, VP → vice president);
//   * the subject of the title is compared separately from its rank, so
//     "HR" and "Human Resources Manager" meet, while "HR Intern" and
//     "HR Director" stay apart;
//   * titles that share no words but mean the same thing meet through
//     their department ("Head of People" ↔ "HR Manager").

/** Punctuation and casing out, "&" spelled, words out. */
function tokenize(text: string): string[] {
  return expandAbbreviations(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Abbreviations as they're actually typed, spelled out so the two sides
 * of a comparison end up in the same words.
 *
 * Deliberately conservative: an abbreviation that means two different
 * jobs (PM = project or product manager, EA, PA) is left alone rather
 * than guessed at, because a wrong expansion routes a lead to the wrong
 * sequence.
 */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/&/g, " and "],
  // departments and functions
  [/\bhr\b/g, "human resources"],
  [/\bhrbp\b/g, "human resources business partner"],
  [/\bta\b/g, "talent acquisition"],
  [/\bl ?and ?d\b/g, "learning and development"],
  [/\bc ?and ?b\b/g, "compensation and benefits"],
  [/\bit\b/g, "information technology"],
  [/\bict\b/g, "information technology"],
  [/\bqa\b/g, "quality assurance"],
  [/\bqc\b/g, "quality control"],
  [/\br ?and ?d\b/g, "research and development"],
  [/\bbi\b/g, "business intelligence"],
  [/\bfp ?and ?a\b/g, "financial planning and analysis"],
  [/\bpr\b/g, "public relations"],
  [/\bseo\b/g, "search engine optimization"],
  [/\bux\b/g, "user experience"],
  [/\bui\b/g, "user interface"],
  [/\bpmo\b/g, "project management office"],
  [/\bbd\b/g, "business development"],
  [/\bsdr\b/g, "sales development representative"],
  [/\bbdr\b/g, "business development representative"],
  [/\bbdm\b/g, "business development manager"],
  [/\bae\b/g, "account executive"],
  [/\bcsm\b/g, "customer success manager"],
  [/\bsysadmin\b/g, "systems administrator"],
  [/\bswe\b/g, "software engineer"],
  [/\bops\b/g, "operations"],
  // ranks
  [/\bceo\b/g, "chief executive officer"],
  [/\bcoo\b/g, "chief operating officer"],
  [/\bcfo\b/g, "chief financial officer"],
  [/\bcto\b/g, "chief technology officer"],
  [/\bcio\b/g, "chief information officer"],
  [/\bciso\b/g, "chief information security officer"],
  [/\bcmo\b/g, "chief marketing officer"],
  [/\bcro\b/g, "chief revenue officer"],
  [/\bchro\b/g, "chief human resources officer"],
  [/\bcpo\b/g, "chief product officer"],
  [/\bcoe\b/g, "center of excellence"],
  [/\bmd\b/g, "managing director"],
  [/\bgm\b/g, "general manager"],
  [/\bsvp\b/g, "senior vice president"],
  [/\bevp\b/g, "executive vice president"],
  [/\bavp\b/g, "assistant vice president"],
  [/\bvp\b/g, "vice president"],
  [/\bmgr\b/g, "manager"],
  [/\bmgmt\b/g, "management"],
  [/\bdir\b/g, "director"],
  [/\bsr\b/g, "senior"],
  [/\bsnr\b/g, "senior"],
  [/\bjr\b/g, "junior"],
  [/\basst\b/g, "assistant"],
  [/\bexec\b/g, "executive"],
];

function expandAbbreviations(text: string): string {
  let out = text.toLowerCase();
  for (const [re, full] of ABBREVIATIONS) out = out.replace(re, full);
  return out;
}

/** Words that carry no meaning in a job title. */
const NOISE = new Set([
  "of", "the", "and", "for", "at", "in", "to", "a", "an", "on", "with",
  "department", "departments", "dept", "division", "team", "group",
  "global", "regional", "corporate", "country", "emea", "apac", "mena", "amer",
  "general", "staff",
]);

/**
 * How senior a word says the job is. A title's rank is its highest word,
 * so "Assistant HR Manager" counts as manager-level.
 */
const RANKS: Record<string, number> = {
  intern: 1, internship: 1, trainee: 1, junior: 1, entry: 1, apprentice: 1,
  assistant: 2, associate: 2, analyst: 2, specialist: 2, coordinator: 2,
  officer: 2, engineer: 2, developer: 2, representative: 2, consultant: 2,
  administrator: 2, generalist: 2, recruiter: 2, executive: 2, agent: 2,
  accountant: 2, designer: 2, scientist: 2, expert: 2,
  // "partner" is deliberately absent: a Business Partner is a role, not a
  // rank, and ranking it junior kept HRBPs out of HR-manager sequences.
  senior: 3, lead: 3, leader: 3, principal: 3, supervisor: 3, architect: 3,
  manager: 4, management: 4, head: 4, superintendent: 4, master: 4,
  director: 5,
  vice: 6, president: 6, managing: 6,
  chief: 7, founder: 7, cofounder: 7, owner: 7, chairman: 7, chairperson: 7,
};

export interface ParsedTitle {
  /** Every meaningful word, in order. */
  tokens: string[];
  /** What the job is about — the words that aren't a rank. */
  subject: string[];
  /** How senior it is, 0 when the title doesn't say. */
  rank: number;
}

/** Crude singular form, so "resources" and "resource" compare equal. */
function stem(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function parseTitle(text: string | null | undefined): ParsedTitle {
  const tokens = tokenize(text ?? "").filter((w) => !NOISE.has(w));
  let rank = 0;
  const subject: string[] = [];
  for (const w of tokens) {
    const r = RANKS[w];
    if (r) rank = Math.max(rank, r);
    else subject.push(stem(w));
  }
  return { tokens: tokens.map(stem), subject, rank };
}

/** Is `needle` a run of words inside `haystack`? */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/** Does one list of words contain all of the other's? */
function eitherContainsAll(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const inA = new Set(a);
  const inB = new Set(b);
  return a.every((w) => inB.has(w)) || b.every((w) => inA.has(w));
}

// ─── Departments ─────────────────────────────────────────────────────────────

export interface Department {
  key: string;
  name: string;
  /**
   * Phrases that place a title in this department, matched after
   * abbreviations are expanded. The longest matching phrase across all
   * departments wins, so "business development" beats "development".
   */
  patterns: string[];
}

export const DEPARTMENTS: Department[] = [
  {
    key: "human_resources",
    name: "Human Resources",
    patterns: [
      "human resources", "human resource", "people operations", "people partner",
      "people officer", "people manager", "head of people", "talent acquisition",
      "talent management", "talent", "recruitment", "recruiting", "recruiter",
      "learning and development", "compensation and benefits", "payroll",
      "personnel", "employee relations", "employee experience",
    ],
  },
  {
    key: "information_technology",
    name: "IT",
    patterns: [
      "information technology", "systems administrator", "system administrator",
      "network", "infrastructure", "helpdesk", "help desk", "service desk",
      "information security", "cyber security", "cybersecurity", "sysops",
      "technical support", "it support",
    ],
  },
  {
    key: "engineering",
    name: "Engineering",
    patterns: [
      "engineering", "engineer", "software", "developer", "development operations",
      "devops", "quality assurance", "quality control", "architect",
      "research and development", "technology", "technical",
    ],
  },
  {
    key: "product",
    name: "Product",
    patterns: ["product management", "product manager", "product owner", "product"],
  },
  {
    key: "data",
    name: "Data & Analytics",
    patterns: [
      "data science", "data scientist", "data analytics", "data analyst", "data engineer",
      "business intelligence", "analytics", "data",
    ],
  },
  {
    key: "design",
    name: "Design",
    patterns: ["design", "designer", "user experience", "user interface", "creative", "brand design"],
  },
  {
    key: "sales",
    name: "Sales",
    patterns: [
      "sales", "business development", "account executive", "account manager",
      "account management", "revenue", "commercial", "key account", "pre sales",
      "presales", "channel", "distribution",
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    patterns: [
      "marketing", "brand", "communications", "public relations", "content",
      "demand generation", "growth", "search engine optimization", "social media",
      "advertising", "campaign",
    ],
  },
  {
    key: "customer_success",
    name: "Customer Success & Support",
    patterns: [
      "customer success", "customer support", "customer service", "customer experience",
      "client services", "client success", "customer care", "call center",
    ],
  },
  {
    key: "finance",
    name: "Finance & Accounting",
    patterns: [
      "finance", "financial", "accounting", "accountant", "controller", "treasury",
      "audit", "auditor", "bookkeeping", "bookkeeper", "tax",
      "financial planning and analysis", "credit", "billing",
    ],
  },
  {
    key: "operations",
    name: "Operations",
    patterns: [
      "operations", "logistics", "supply chain", "warehouse", "fulfillment",
      "manufacturing", "production", "maintenance", "facilities", "quality",
      "health and safety", "hse",
    ],
  },
  {
    key: "procurement",
    name: "Procurement",
    patterns: ["procurement", "purchasing", "sourcing", "buyer", "vendor management", "supplier"],
  },
  {
    key: "project_management",
    name: "Project Management",
    patterns: [
      "project management office", "project management", "project manager", "project",
      "program management", "program manager", "programme manager", "scrum master",
      "delivery manager", "implementation",
    ],
  },
  {
    key: "legal",
    name: "Legal & Compliance",
    patterns: [
      "legal", "counsel", "attorney", "lawyer", "paralegal", "compliance",
      "regulatory", "contracts", "governance",
    ],
  },
  {
    key: "administration",
    name: "Administration",
    patterns: [
      "administration", "administrative", "office manager", "executive assistant",
      "receptionist", "secretary", "back office",
    ],
  },
  {
    key: "executive",
    name: "Executive / C-Suite",
    patterns: [
      "chief executive officer", "chief operating officer", "managing director",
      "general manager", "founder", "cofounder", "owner", "board member",
      "chairman", "chairperson", "president",
    ],
  },
];

const DEPARTMENT_BY_KEY = new Map(DEPARTMENTS.map((d) => [d.key, d]));

export function departmentName(key: string): string {
  return DEPARTMENT_BY_KEY.get(key)?.name ?? key;
}

/** A phrase as a word-boundary regex, tolerating plurals on each word. */
function phraseRegex(phrase: string): RegExp {
  const body = phrase
    .split(/\s+/)
    .map((w) => `${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?`)
    .join("\\s+");
  return new RegExp(`\\b${body}\\b`);
}

const PATTERN_CACHE = new Map<string, RegExp>();
function cachedRegex(phrase: string): RegExp {
  let re = PATTERN_CACHE.get(phrase);
  if (!re) {
    re = phraseRegex(phrase);
    PATTERN_CACHE.set(phrase, re);
  }
  return re;
}

/**
 * Which department a job title (or a department name as Lusha wrote it)
 * belongs to, or null when nothing fits.
 *
 * The most specific phrase wins: "Business Development Manager" is Sales,
 * not Engineering, even though "development" appears in both.
 */
export function inferDepartment(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const haystack = tokenize(text).join(" ");
  if (!haystack) return null;

  let bestKey: string | null = null;
  let bestLength = 0;
  for (const dept of DEPARTMENTS) {
    for (const pattern of dept.patterns) {
      if (pattern.length <= bestLength) continue;
      if (cachedRegex(pattern).test(haystack)) {
        bestKey = dept.key;
        bestLength = pattern.length;
      }
    }
  }
  return bestKey;
}

/**
 * The department a lead belongs to: what the data provider said, and
 * failing that what the job title implies — so imported leads with only
 * a title still route by department.
 */
export function leadDepartment(lead: {
  department?: string | null;
  job_title?: string | null;
}): string | null {
  return inferDepartment(lead.department) ?? inferDepartment(lead.job_title);
}

// ─── Matching ────────────────────────────────────────────────────────────────

/** Ranks this far apart are different jobs, not the same one. */
const RANK_TOLERANCE = 1;

/**
 * Does this job title fall under this position?
 *
 * In order: the position's exact words appear in the title; or the two
 * are about the same subject at a comparable rank; or they're different
 * words for the same department at a comparable rank.
 */
export function titleMatchesPosition(
  title: string | null | undefined,
  position: string | null | undefined,
): boolean {
  const t = parseTitle(title);
  const p = parseTitle(position);
  if (p.tokens.length === 0 || t.tokens.length === 0) return false;

  // "HR Manager" inside "Senior HR Manager".
  if (containsSequence(t.tokens, p.tokens)) return true;

  const rankCompatible =
    t.rank === 0 || p.rank === 0 || Math.abs(t.rank - p.rank) <= RANK_TOLERANCE;

  // A position that is only a rank ("Manager", "Head"): anyone at that
  // level, whatever they do — and only that level, since the rank is the
  // whole of what was asked for.
  if (p.subject.length === 0) return t.rank > 0 && t.rank === p.rank;
  // A title that is only a rank can't be matched to a subject.
  if (t.subject.length === 0) return false;

  if (!rankCompatible) return false;
  if (eitherContainsAll(p.subject, t.subject)) return true;

  // Different words, same job: "Head of People" ↔ "HR Manager".
  const td = inferDepartment(title);
  const pd = inferDepartment(position);
  return td !== null && td === pd;
}

/** Is this lead in one of these departments? */
export function leadMatchesDepartments(
  lead: { department?: string | null; job_title?: string | null },
  departments: string[],
): boolean {
  if (departments.length === 0) return false;
  const key = leadDepartment(lead);
  return key !== null && departments.includes(key);
}
