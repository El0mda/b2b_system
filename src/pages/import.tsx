import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
} from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_EXT = [".csv", ".xlsx", ".xls"];

type Step = "upload" | "map" | "configure" | "result";

interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  failed: number;
}

interface Campaign {
  id: string;
  name: string;
}

interface ImportLogRow {
  id: string;
  file_name: string | null;
  campaign_id: string | null;
  total_rows: number | null;
  imported_rows: number | null;
  duplicate_rows: number | null;
  status: string | null;
  created_at: string | null;
}

export default function ImportPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [mapping, setMapping] = useState<Record<string, LeadFieldKey>>({});
  const [campaignId, setCampaignId] = useState<string>("new");
  const [newCampaignName, setNewCampaignName] = useState("");
  const [dedupe, setDedupe] = useState(true);
  const [verify, setVerify] = useState(true);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [resultCampaignId, setResultCampaignId] = useState<string | null>(null);

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns-list", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: imports = [] } = useQuery<ImportLogRow[]>({
    queryKey: ["imports", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imports")
        .select(
          "id, file_name, campaign_id, total_rows, imported_rows, duplicate_rows, status, created_at",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ImportLogRow[];
    },
  });

  const campaignNameById = useMemo(() => {
    const m = new Map<string, string>();
    campaigns.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [campaigns]);

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
      setStep("map");
    } catch (e: any) {
      toast.error(e?.message || "Could not parse file");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const resetWizard = () => {
    setFile(null);
    setParsed(null);
    setMapping({});
    setCampaignId("new");
    setNewCampaignName("");
    setDedupe(true);
    setVerify(true);
    setSummary(null);
    setResultCampaignId(null);
    setStep("upload");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Import Leads</h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV or Excel file to add leads to a campaign.
        </p>
      </div>

      <StepProgress current={step} />

      {step === "upload" && <UploadStep onFile={handleFile} parsing={parsing} />}

      {step === "map" && parsed && (
        <MapStep
          parsed={parsed}
          mapping={mapping}
          onChange={setMapping}
          onBack={() => setStep("upload")}
          onNext={() => setStep("configure")}
        />
      )}

      {step === "configure" && parsed && (
        <ConfigureStep
          totalRows={parsed.totalRows}
          campaigns={campaigns}
          campaignId={campaignId}
          setCampaignId={setCampaignId}
          newCampaignName={newCampaignName}
          setNewCampaignName={setNewCampaignName}
          dedupe={dedupe}
          setDedupe={setDedupe}
          verify={verify}
          setVerify={setVerify}
          importing={importing}
          onBack={() => setStep("map")}
          onImport={async () => {
            if (!orgId || !parsed || !file) return;
            setImporting(true);
            try {
              const result = await runImport({
                orgId,
                file,
                parsed,
                mapping,
                campaignId,
                newCampaignName,
                dedupe,
                verify,
              });
              setSummary(result.summary);
              setResultCampaignId(result.campaignId);
              setStep("result");
              qc.invalidateQueries({ queryKey: ["imports", orgId] });
              qc.invalidateQueries({ queryKey: ["campaigns-list", orgId] });
            } catch (e: any) {
              toast.error(e?.message || "Import failed");
            } finally {
              setImporting(false);
            }
          }}
        />
      )}

      {step === "result" && summary && (
        <ResultStep
          summary={summary}
          onReset={resetWizard}
          onView={() => {
            if (resultCampaignId) navigate(`/campaigns/${resultCampaignId}`);
            else navigate("/leads");
          }}
        />
      )}

      <ImportHistory imports={imports} campaignNameById={campaignNameById} />
    </div>
  );
}

function StepProgress({ current }: { current: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "upload", label: "1. Upload" },
    { key: "map", label: "2. Map Columns" },
    { key: "configure", label: "3. Configure" },
    { key: "result", label: "4. Import" },
  ];
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
              i < idx
                ? "bg-primary text-white"
                : i === idx
                  ? "bg-primary text-white ring-4 ring-primary/20"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < idx ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <div
            className={cn(
              "ml-2 text-sm font-medium",
              i === idx ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {s.label.replace(/^\d+\.\s*/, "")}
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn("mx-3 h-0.5 flex-1 rounded", i < idx ? "bg-primary" : "bg-muted")}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function UploadStep({
  onFile,
  parsing,
}: {
  onFile: (f: File) => void;
  parsing: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <Card>
      <CardContent>
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
            if (f) onFile(f);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-16 transition-colors",
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
              if (f) onFile(f);
            }}
            disabled={parsing}
          />
          {parsing ? (
            <>
              <Spinner className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Parsing your file…</p>
            </>
          ) : (
            <>
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <p className="mb-1 text-base font-semibold">Drag & drop your file here</p>
              <p className="mb-4 text-sm text-muted-foreground">
                or click to browse — .csv, .xlsx, .xls — up to 10 MB
              </p>
              <Button type="button" variant="outline" asChild>
                <span>
                  <Download className="h-4 w-4" />
                  Choose File
                </span>
              </Button>
            </>
          )}
        </label>
      </CardContent>
    </Card>
  );
}

function MapStep({
  parsed,
  mapping,
  onChange,
  onBack,
  onNext,
}: {
  parsed: ParsedFile;
  mapping: Record<string, LeadFieldKey>;
  onChange: (m: Record<string, LeadFieldKey>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const emailMapped = Object.values(mapping).includes("email");
  const preview = parsed.rows.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map your columns</CardTitle>
        <p className="text-sm text-muted-foreground">
          We found <strong>{parsed.totalRows}</strong> rows and{" "}
          <strong>{parsed.headers.length}</strong> columns. Match your file columns to lead fields.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Your File Column</TableHead>
                <TableHead>Maps To</TableHead>
                <TableHead>Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.headers.map((h) => (
                <TableRow key={h}>
                  <TableCell className="font-medium">{h}</TableCell>
                  <TableCell className="min-w-[220px]">
                    <Select
                      value={mapping[h] ?? "skip"}
                      onChange={(e) => onChange({ ...mapping, [h]: e.target.value as LeadFieldKey })}
                    >
                      {LEAD_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {parsed.rows[0]?.[h] ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!emailMapped && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>You must map a column to <strong>Email</strong> to continue.</span>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-semibold">Preview (first 5 rows)</div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {parsed.headers.map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, i) => (
                  <TableRow key={i}>
                    {parsed.headers.map((h) => (
                      <TableCell key={h} className="text-xs">
                        {row[h]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={onNext} disabled={!emailMapped}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigureStep({
  totalRows,
  campaigns,
  campaignId,
  setCampaignId,
  newCampaignName,
  setNewCampaignName,
  dedupe,
  setDedupe,
  verify,
  setVerify,
  importing,
  onBack,
  onImport,
}: {
  totalRows: number;
  campaigns: Campaign[];
  campaignId: string;
  setCampaignId: (id: string) => void;
  newCampaignName: string;
  setNewCampaignName: (n: string) => void;
  dedupe: boolean;
  setDedupe: (v: boolean) => void;
  verify: boolean;
  setVerify: (v: boolean) => void;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure import</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="campaign">Assign to campaign</Label>
          <Select
            id="campaign"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="new">+ Create new campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {campaignId === "new" && (
          <div className="space-y-1.5">
            <Label htmlFor="new-campaign-name">New campaign name</Label>
            <Input
              id="new-campaign-name"
              placeholder="e.g. April Outbound Import"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <div className="text-sm font-medium">Check for duplicates</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Skip leads that already exist in your database (matched by email).
            </p>
          </div>
          <Switch checked={dedupe} onCheckedChange={setDedupe} />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <div className="text-sm font-medium">Verify emails</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Run NeverBounce verification on all imported emails. Requires a NeverBounce key in
              Settings. May skip silently if browser CORS blocks the request.
            </p>
          </div>
          <Switch checked={verify} onCheckedChange={setVerify} />
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack} disabled={importing}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={onImport} disabled={importing}>
            {importing && <Spinner />}
            Import {totalRows} leads
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultStep({
  summary,
  onReset,
  onView,
}: {
  summary: ImportSummary;
  onReset: () => void;
  onView: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <ResultStat label="Total rows" value={summary.total} icon={Clock} color="text-muted-foreground" />
          <ResultStat
            label="Imported"
            value={summary.imported}
            icon={CheckCircle2}
            color="text-emerald-600"
          />
          <ResultStat
            label="Duplicates"
            value={summary.duplicates}
            icon={X}
            color="text-amber-600"
          />
          <ResultStat
            label="Invalid emails"
            value={summary.invalid}
            icon={AlertCircle}
            color="text-orange-600"
          />
          <ResultStat label="Failed" value={summary.failed} icon={X} color="text-destructive" />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onReset}>
            Import another
          </Button>
          <Button onClick={onView}>View Leads</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className={cn("mb-1 flex items-center gap-1.5 text-xs font-medium uppercase", color)}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function ImportHistory({
  imports,
  campaignNameById,
}: {
  imports: ImportLogRow[];
  campaignNameById: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {imports.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No imports yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Duplicates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      {row.file_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.campaign_id ? (
                      <Link
                        to={`/campaigns/${row.campaign_id}`}
                        className="text-primary hover:underline"
                      >
                        {campaignNameById.get(row.campaign_id) ?? row.campaign_id.slice(0, 6)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{row.total_rows ?? 0}</TableCell>
                  <TableCell>{row.imported_rows ?? 0}</TableCell>
                  <TableCell>{row.duplicate_rows ?? 0}</TableCell>
                  <TableCell>
                    {row.status === "completed" ? (
                      <Badge variant="success">Completed</Badge>
                    ) : row.status === "failed" ? (
                      <Badge className="bg-destructive/10 text-destructive">Failed</Badge>
                    ) : (
                      <Badge variant="warning">{row.status ?? "processing"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.created_at ? format(new Date(row.created_at), "MMM d, yyyy HH:mm") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// =========================================================
// Import execution
// =========================================================
async function runImport(opts: {
  orgId: string;
  file: File;
  parsed: ParsedFile;
  mapping: Record<string, LeadFieldKey>;
  campaignId: string;
  newCampaignName: string;
  dedupe: boolean;
  verify: boolean;
}): Promise<{ summary: ImportSummary; campaignId: string }> {
  const { orgId, file, parsed, mapping, dedupe, verify } = opts;

  // 1. Resolve campaign
  let campaignId = opts.campaignId;
  if (campaignId === "new") {
    const name = opts.newCampaignName.trim();
    if (!name) throw new Error("Campaign name required for new campaign");
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({ org_id: orgId, name, status: "draft", source: "import" })
      .select()
      .single();
    if (error) throw error;
    campaignId = campaign.id;
  }

  // 2. Build lead candidates from rows
  const reverseMap = new Map<LeadFieldKey, string>();
  for (const [header, field] of Object.entries(mapping)) {
    if (field !== "skip") reverseMap.set(field, header);
  }

  type Candidate = {
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
  };

  const candidates: Candidate[] = [];
  let invalid = 0;
  for (const row of parsed.rows) {
    const get = (k: LeadFieldKey) => {
      const h = reverseMap.get(k);
      return h ? (row[h] ?? "").trim() : "";
    };
    let email = get("email").toLowerCase();
    if (!email || !isValidEmail(email)) {
      invalid++;
      continue;
    }
    let first = get("first_name");
    let last = get("last_name");
    const full = get("full_name");
    if (full && !first && !last) {
      const parts = splitFullName(full);
      first = parts.first;
      last = parts.last;
    }
    candidates.push({
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

  // 3. Dedupe against existing org leads
  let duplicates = 0;
  let toInsert = candidates;
  if (dedupe && candidates.length > 0) {
    const emails = Array.from(new Set(candidates.map((c) => c.email)));
    const existing = new Set<string>();
    // Chunk the IN query — Postgrest URL gets big with many emails
    const CHUNK = 500;
    for (let i = 0; i < emails.length; i += CHUNK) {
      const slice = emails.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("leads")
        .select("email")
        .eq("org_id", orgId)
        .in("email", slice);
      if (error) throw error;
      (data ?? []).forEach((r) => r.email && existing.add(r.email.toLowerCase()));
    }
    toInsert = candidates.filter((c) => {
      if (existing.has(c.email)) {
        duplicates++;
        return false;
      }
      return true;
    });

    // Also dedupe within the file itself
    const seen = new Set<string>();
    toInsert = toInsert.filter((c) => {
      if (seen.has(c.email)) {
        duplicates++;
        return false;
      }
      seen.add(c.email);
      return true;
    });
  }

  // 4. Verify emails via NeverBounce (via proxy)
  const verifyEmail = async (email: string) => {
    if (!verify) return { result: null as string | null, valid: null as boolean | null };
    try {
      const { data, error } = await supabase.functions.invoke("neverbounce-proxy", {
        body: { action: "verify", email },
      });
      if (error || !data?.nb_result) return { result: "skipped", valid: null };
      return { result: data.nb_result, valid: data.email_valid };
    } catch {
      return { result: "skipped", valid: null };
    }
  };

  // 5. Insert in chunks
  let imported = 0;
  let failed = 0;
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH);
    let enriched = slice.map((c) => ({ ...c, nb_result: null as string | null, email_valid: null as boolean | null }));
    if (verify) {
      enriched = await Promise.all(
        slice.map(async (c) => {
          const v = await verifyEmail(c.email);
          return { ...c, nb_result: v.result, email_valid: v.valid };
        }),
      );
    }
    const rows = enriched.map((c) => ({
      org_id: orgId,
      campaign_id: campaignId,
      source: "import",
      email: c.email,
      first_name: c.first_name ?? null,
      last_name: c.last_name ?? null,
      full_name: c.full_name ?? null,
      company: c.company ?? null,
      job_title: c.job_title ?? null,
      phone: c.phone ?? null,
      location: c.location ?? null,
      linkedin_url: c.linkedin_url ?? null,
      website: c.website ?? null,
      nb_result: c.nb_result,
      email_valid: c.email_valid,
      added_to_campaign: true,
    }));
    const { error, count } = await supabase
      .from("leads")
      .insert(rows, { count: "exact" });
    if (error) {
      failed += slice.length;
    } else {
      imported += count ?? slice.length;
    }
  }

  // 6. Update campaign counters
  await supabase
    .from("campaigns")
    .update({
      leads_added: imported,
      leads_imported: imported,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  // 7. Log the import
  const summary: ImportSummary = {
    total: parsed.totalRows,
    imported,
    duplicates,
    invalid,
    failed,
  };
  await supabase.from("imports").insert({
    org_id: orgId,
    campaign_id: campaignId,
    file_name: file.name,
    total_rows: summary.total,
    imported_rows: summary.imported,
    duplicate_rows: summary.duplicates,
    skipped_rows: summary.invalid,
    status: failed > 0 ? "failed" : "completed",
    error_message: failed > 0 ? `${failed} rows failed to insert` : null,
  });

  return { summary, campaignId };
}
