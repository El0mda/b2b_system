import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Upload,
  FileSpreadsheet,
  ArrowRight,
  AlertCircle,
  Check,
  Phone,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { lookupVerification, verifyEmails } from "@/lib/verify-emails";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseFile,
  autoDetectMapping,
  LEAD_FIELDS,
  isValidEmail,
  splitFullName,
  type ParsedFile,
  type LeadFieldKey,
} from "@/lib/file-parser";
import { cn } from "@/lib/utils";
import { LushaSearch } from "@/components/lusha/lusha-search";
import type { WizardLead, WizardState } from "./types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXT = [".csv", ".xlsx", ".xls"];

export function StepSource({
  state,
  setState,
  onNext,
  onBack,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lead Source</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex gap-2 border-b border-border">
            <TabButton
              active={state.sourceTab === "lusha"}
              onClick={() => setState((p) => ({ ...p, sourceTab: "lusha" }))}
              icon={<Search className="h-4 w-4" />}
              label="Search Lusha"
            />
            <TabButton
              active={state.sourceTab === "import"}
              onClick={() => setState((p) => ({ ...p, sourceTab: "import" }))}
              icon={<Upload className="h-4 w-4" />}
              label="Import File"
            />
          </div>

          {state.sourceTab === "lusha" ? (
            <LushaTab state={state} setState={setState} />
          ) : (
            <ImportTab state={state} setState={setState} />
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={state.selectedLeadIds.size === 0}>
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Lusha Tab ───────────────────────────────────────────────────────────────

/**
 * The wizard's half of the Lusha search: it owns the filters and keeps
 * whatever comes back in wizard state, ready for the Review step. The
 * search itself lives in components/lusha/lusha-search.tsx, shared with
 * the Find Leads page.
 */
function LushaTab({
  state,
  setState,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
}) {
  return (
    <LushaSearch
      filters={state.lushaFilters}
      setFilters={(updater) =>
        setState((p) => ({ ...p, lushaFilters: updater(p.lushaFilters) }))
      }
      startInResults={state.leads.length > 0}
      onLeads={(leads) => {
        setState((p) => ({
          ...p,
          leads,
          selectedLeadIds: new Set(leads.map((_, i) => String(i))),
        }));
        toast.success(`${leads.length} leads enriched`);
      }}
    />
  );
}

// ─── Import Tab ───────────────────────────────────────────────────────────────

function ImportTab({
  state,
  setState,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, LeadFieldKey>>({});
  const [dedupe, setDedupe] = useState(true);
  const [verify, setVerify] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      toast.error("File is larger than 10 MB");
      return;
    }
    const ext = "." + (f.name.toLowerCase().split(".").pop() ?? "");
    if (!ACCEPTED_EXT.includes(ext)) {
      toast.error("Only .csv, .xlsx, .xls files are supported");
      return;
    }
    setParsing(true);
    setFile(f);
    try {
      const result = await parseFile(f);
      if (result.totalRows === 0) {
        toast.error("File appears to be empty");
        setFile(null);
        return;
      }
      setParsed(result);
      setMapping(autoDetectMapping(result.headers));
    } catch (e: any) {
      toast.error(e?.message || "Could not parse file");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const emailMapped = Object.values(mapping).includes("email");

  const buildLeads = (): WizardLead[] => {
    if (!parsed) return [];
    const reverseMap = new Map<LeadFieldKey, string>();
    for (const [header, field] of Object.entries(mapping)) {
      if (field !== "skip") reverseMap.set(field, header);
    }
    const seen = new Set<string>();
    const out: WizardLead[] = [];
    for (const row of parsed.rows) {
      const get = (k: LeadFieldKey) => {
        const h = reverseMap.get(k);
        return h ? (row[h] ?? "").trim() : "";
      };
      const email = get("email").toLowerCase();
      if (!email || !isValidEmail(email)) continue;
      if (dedupe && seen.has(email)) continue;
      seen.add(email);
      let first = get("first_name");
      let last = get("last_name");
      const full = get("full_name");
      if (full && !first && !last) {
        const parts = splitFullName(full);
        first = parts.first;
        last = parts.last;
      }
      out.push({
        email,
        first_name: first || undefined,
        last_name: last || undefined,
        full_name: full || `${first} ${last}`.trim() || undefined,
        company: get("company") || undefined,
        job_title: get("job_title") || undefined,
        phone: get("phone") || undefined,
        location: get("location") || undefined,
        linkedin_url: get("linkedin_url") || undefined,
        website: get("website") || undefined,
      });
    }
    return out;
  };

  const handleImport = async () => {
    if (!emailMapped) {
      toast.error("Map a column to Email first");
      return;
    }
    let leads = buildLeads();
    if (leads.length === 0) {
      toast.error("No valid leads in this file");
      return;
    }

    // Drop rows that already exist in this org's leads — matches the
    // dedup the standalone /import page does, which this wizard tab
    // otherwise skips (it only deduped within the file itself).
    let dbDuplicates = 0;
    if (dedupe && orgId) {
      const emails = leads.map((l) => l.email);
      const existing = new Set<string>();
      const CHUNK = 500;
      for (let i = 0; i < emails.length; i += CHUNK) {
        const slice = emails.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("leads")
          .select("email")
          .eq("org_id", orgId)
          .in("email", slice);
        (data ?? []).forEach((r: any) => r.email && existing.add(r.email.toLowerCase()));
      }
      const before = leads.length;
      leads = leads.filter((l) => !existing.has(l.email));
      dbDuplicates = before - leads.length;
    }
    if (leads.length === 0) {
      toast.error("Every lead in this file is already in your database");
      return;
    }

    // Verify through Emailable, batched (see src/lib/verify-emails.ts)
    if (verify) {
      setVerifying(true);
      try {
        const verification = await verifyEmails(leads.map((l) => l.email));
        leads = leads.map((l) => {
          const v = lookupVerification(verification, l.email);
          return { ...l, nb_result: v.result, email_valid: v.valid };
        });
      } catch {}
      setVerifying(false);
    }

    setState((p) => ({
      ...p,
      leads,
      selectedLeadIds: new Set(leads.map((_, i) => String(i))),
    }));
    toast.success(
      `${leads.length} leads loaded${verify ? " and verified" : ""}` +
        (dbDuplicates > 0
          ? ` (${dbDuplicates} already in your database were skipped)`
          : ""),
    );
  };

  const loaded = state.leads.length > 0 && state.sourceTab === "import";

  return (
    <div className="space-y-6">
      {!parsed && !loaded ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20 hover:bg-muted/40",
          )}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={parsing}
          />
          {parsing ? (
            <>
              <Spinner className="mb-3 h-7 w-7 text-primary" />
              <p className="text-sm font-medium">Parsing your file…</p>
            </>
          ) : (
            <>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <p className="mb-1 text-sm font-semibold">
                Drag & drop your file here
              </p>
              <p className="text-xs text-muted-foreground">
                .csv, .xlsx, .xls — up to 10 MB
              </p>
            </>
          )}
        </label>
      ) : loaded ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {state.leads.length} leads loaded from {file?.name}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setParsed(null);
                setMapping({});
                setFile(null);
                setState((p) => ({
                  ...p,
                  leads: [],
                  selectedLeadIds: new Set(),
                }));
              }}
            >
              ← New import
            </Button>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.leads.slice(0, 50).map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {(l.full_name ??
                        `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim()) ||
                        "—"}
                    </TableCell>
                    <TableCell>{l.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.company ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.job_title ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      {l.nb_result === null || l.nb_result === undefined ? (
                        <Badge variant="secondary">Not run</Badge>
                      ) : l.nb_result === "valid" ||
                        l.nb_result === "catchall" ? (
                        <Badge variant="success">{l.nb_result}</Badge>
                      ) : l.nb_result === "invalid" ||
                        l.nb_result === "disposable" ? (
                        <Badge className="bg-destructive/10 text-destructive">
                          {l.nb_result}
                        </Badge>
                      ) : (
                        <Badge variant="warning">{l.nb_result}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {state.leads.length > 50 && (
              <p className="p-3 text-center text-xs text-muted-foreground">
                + {state.leads.length - 50} more not shown
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{file?.name}</span>
              <span className="text-muted-foreground">
                · {parsed?.totalRows} rows · {parsed?.headers.length} columns
              </span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Map your columns</div>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Your Column</TableHead>
                    <TableHead>Maps To</TableHead>
                    <TableHead>Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(parsed?.headers ?? []).map((h) => (
                    <TableRow key={h}>
                      <TableCell className="font-medium">{h}</TableCell>
                      <TableCell className="min-w-[200px]">
                        <Select
                          value={mapping[h] ?? "skip"}
                          onChange={(e) =>
                            setMapping({
                              ...mapping,
                              [h]: e.target.value as LeadFieldKey,
                            })
                          }
                        >
                          {LEAD_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {parsed?.rows[0]?.[h] ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!emailMapped && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  You must map a column to <strong>Email</strong> to continue.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Check for duplicates"
              hint="Skip rows whose email already exists in this file."
              checked={dedupe}
              onChange={setDedupe}
            />
            <ToggleRow
              label="Verify emails"
              hint="Check each address with Emailable during import (uses verification credits)."
              checked={verify}
              onChange={setVerify}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setParsed(null);
                setMapping({});
                setFile(null);
              }}
            >
              Reset
            </Button>
            <Button onClick={handleImport} disabled={!emailMapped || verifying}>
              {verifying ? <Spinner /> : <Upload className="h-4 w-4" />}
              Import Leads
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
