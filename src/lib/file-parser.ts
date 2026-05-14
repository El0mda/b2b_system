import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export const LEAD_FIELDS = [
  { key: "skip", label: "— Skip this column —" },
  { key: "email", label: "Email (required)", required: true },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "full_name", label: "Full Name" },
  { key: "company", label: "Company" },
  { key: "job_title", label: "Job Title" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "website", label: "Website" },
] as const;

export type LeadFieldKey = (typeof LEAD_FIELDS)[number]["key"];

const AUTO_DETECT_RULES: Array<{ field: LeadFieldKey; patterns: RegExp[] }> = [
  { field: "email", patterns: [/^e[-_ ]?mail([-_ ]?address)?$/i, /^email$/i] },
  { field: "first_name", patterns: [/^first[-_ ]?name$/i, /^fname$/i, /^given[-_ ]?name$/i] },
  { field: "last_name", patterns: [/^last[-_ ]?name$/i, /^lname$/i, /^surname$/i, /^family[-_ ]?name$/i] },
  { field: "full_name", patterns: [/^full[-_ ]?name$/i, /^name$/i] },
  { field: "company", patterns: [/^company([-_ ]?name)?$/i, /^organization$/i, /^org$/i, /^employer$/i] },
  { field: "job_title", patterns: [/^(job[-_ ]?)?title$/i, /^position$/i, /^role$/i] },
  { field: "phone", patterns: [/^phone([-_ ]?number)?$/i, /^mobile$/i, /^tel(ephone)?$/i] },
  { field: "location", patterns: [/^location$/i, /^city$/i, /^country$/i, /^region$/i] },
  { field: "linkedin_url", patterns: [/^linkedin([-_ ]?url)?$/i] },
  { field: "website", patterns: [/^website$/i, /^url$/i, /^domain$/i] },
];

export function autoDetectMapping(headers: string[]): Record<string, LeadFieldKey> {
  const mapping: Record<string, LeadFieldKey> = {};
  const usedFields = new Set<LeadFieldKey>();
  for (const header of headers) {
    const clean = header.trim();
    let matched: LeadFieldKey = "skip";
    for (const rule of AUTO_DETECT_RULES) {
      if (usedFields.has(rule.field)) continue;
      if (rule.patterns.some((re) => re.test(clean))) {
        matched = rule.field;
        usedFields.add(rule.field);
        break;
      }
    }
    mapping[header] = matched;
  }
  return mapping;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "csv") return parseCsv(file);
  if (ext === "xlsx" || ext === "xls") return parseXlsx(file);
  throw new Error(`Unsupported file format: .${ext}`);
}

async function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const rows = result.data.map((r) => {
          const norm: Record<string, string> = {};
          for (const h of headers) norm[h] = String(r[h] ?? "").trim();
          return norm;
        });
        resolve({ headers, rows, totalRows: rows.length });
      },
      error: (err) => reject(err),
    });
  });
}

async function parseXlsx(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Spreadsheet has no sheets");
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (json.length === 0) return { headers: [], rows: [], totalRows: 0 };
  const headers = Object.keys(json[0]);
  const rows = json.map((r) => {
    const norm: Record<string, string> = {};
    for (const h of headers) norm[h] = String(r[h] ?? "").trim();
    return norm;
  });
  return { headers, rows, totalRows: rows.length };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
