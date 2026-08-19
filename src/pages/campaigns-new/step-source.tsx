import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Upload,
  FileSpreadsheet,
  ArrowRight,
  AlertCircle,
  X,
  Loader2,
  Check,
  Building2,
  MapPin,
  Cpu,
  Briefcase,
  Hash,
  Globe,
  Mail,
  Phone,
  ChevronDown,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { LushaFilterOption, LushaProspect } from "@/lib/lusha";
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

// ─── Lusha Tab ────────────────────────────────────────────────────────────────

function LushaTab({
  state,
  setState,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [view, setView] = useState<"filters" | "results">(
    state.leads.length > 0 ? "results" : "filters",
  );
  const [filterOptions, setFilterOptions] = useState<{
    industries: LushaFilterOption[];
    companySizes: LushaFilterOption[];
    revenues: LushaFilterOption[];
    departments: LushaFilterOption[];
    seniorities: LushaFilterOption[];
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [prospects, setProspects] = useState<LushaProspect[]>([]);
  const [selectedProspectIds, setSelectedProspectIds] = useState<Set<string>>(
    new Set(),
  );

  // autocomplete states
  const [companyQuery, setCompanyQuery] = useState("");
  const [companySuggestions, setCompanySuggestions] = useState<
    LushaFilterOption[]
  >([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    LushaFilterOption[]
  >([]);
  const [techQuery, setTechQuery] = useState("");
  const [techSuggestions, setTechSuggestions] = useState<LushaFilterOption[]>(
    [],
  );
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [jobTitleSuggestions, setJobTitleSuggestions] = useState<
    LushaFilterOption[]
  >([]);

  const companyTimeout = useRef<ReturnType<typeof setTimeout>>();
  const locationTimeout = useRef<ReturnType<typeof setTimeout>>();
  const techTimeout = useRef<ReturnType<typeof setTimeout>>();
  const jobTitleTimeout = useRef<ReturnType<typeof setTimeout>>();

  const filters = state.lushaFilters;

  // Fetch filter options on mount
  useEffect(() => {
    (async () => {
      try {
        const actions = [
          "filter-sizes",
          "filter-industries",
          "filter-revenues",
          "filter-departments",
          "filter-seniority",
        ];
        const results = await Promise.all(
          actions.map((a) =>
            supabase.functions
              .invoke("lusha-proxy", { body: { action: a } })
              .then((r) => ({ action: a, data: r.data }))
              .catch(() => ({ action: a, data: null })),
          ),
        );
        const opts: Record<string, any[]> = {};
        results.forEach((r) => {
          if (!r.data) return;
          const key = r.action.replace("filter-", "");
          const raw = Array.isArray(r.data) ? r.data : [];

          if (r.action === "filter-sizes") {
            opts[key] = raw.map((s: any) => ({
              id: `${s.min}-${s.max ?? ""}`,
              name: s.max
                ? `${s.min.toLocaleString()} – ${s.max.toLocaleString()}`
                : `${s.min.toLocaleString()}+`,
            }));
          } else if (r.action === "filter-revenues") {
            opts[key] = raw.map((s: any) => {
              const fmt = (n: number) =>
                n >= 1_000_000_000
                  ? `$${n / 1_000_000_000}B`
                  : n >= 1_000_000
                    ? `$${n / 1_000_000}M`
                    : `$${n.toLocaleString()}`;
              return {
                id: `${s.min}-${s.max ?? ""}`,
                name: s.max
                  ? `${fmt(s.min)} – ${fmt(s.max)}`
                  : `${fmt(s.min)}+`,
              };
            });
          } else if (r.action === "filter-departments") {
            // plain string array
            opts[key] = raw.map((s: string) => ({ id: s, name: s }));
          } else if (r.action === "filter-industries") {
            // API returns nested [{main_industry, main_industry_id, sub_industries: [{id, value}]}]
            opts[key] = raw.flatMap((g: any) =>
              (g.sub_industries ?? []).map((s: any) => ({
                id: String(s.id),
                name: `${g.main_industry} › ${s.value}`,
              })),
            );
          } else {
            // seniority returns {id, name} already
            opts[key] = raw;
          }
        });
        if (Object.keys(opts).length > 0) {
          setFilterOptions({
            industries: opts.industries ?? [],
            companySizes: opts.sizes ?? [],
            revenues: opts.revenues ?? [],
            departments: opts.departments ?? [],
            seniorities: opts.seniority ?? [],
          });
        }
      } catch {
        // Non-fatal
      }
    })();
  }, []);

  const autocomplete = useCallback(
    async (
      action: string,
      query: string,
      setter: (v: LushaFilterOption[]) => void,
    ) => {
      if (query.length < 2) {
        setter([]);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("lusha-proxy", {
          body: { action, query },
        });
        if (!error && data?.results) setter(data.results);
      } catch {
        // silent
      }
    },
    [],
  );

  const handleSearch = async () => {
    if (
      !filters.job_titles?.length &&
      !filters.department &&
      !filters.seniorities?.length &&
      !filters.contact_location
    ) {
      toast.error(
        "Please add at least one contact filter: Job Title, Department, Seniority, or Contact Location",
      );
      return;
    }
    setSearching(true);
    try {
      // Contacts this org already has (from a prior Lusha search+enrich)
      // are filtered out before the user ever sees them, and backfilled
      // with extra pages below — so asking for 50 leads always yields 50
      // new ones, not 50-minus-duplicates.
      const existingContactIds = new Set<string>();
      if (orgId) {
        const { data: existing } = await supabase
          .from("leads")
          .select("contact_id")
          .eq("org_id", orgId)
          .not("contact_id", "is", null);
        (existing ?? []).forEach((r: any) => r.contact_id && existingContactIds.add(r.contact_id));
      }

      const target = filters.max_leads || 25;
      const seen = new Set<string>();
      const collected: LushaProspect[] = [];
      const MAX_PAGES = 6;
      let page = 1;
      let exhausted = false;

      while (collected.length < target && page <= MAX_PAGES && !exhausted) {
        const { data, error } = await supabase.functions.invoke("lusha-proxy", {
          body: { action: "search", ...filters, page },
        });
        if (error) throw new Error(error.message || "Search failed");

        const rawPage: any[] = data?.prospects ?? [];
        if (rawPage.length === 0) {
          exhausted = true;
          break;
        }

        const requestId = data?.requestId ?? "";
        for (const p of rawPage) {
          if (collected.length >= target) break;
          if (seen.has(p.contactId) || existingContactIds.has(p.contactId)) continue;
          seen.add(p.contactId);
          collected.push({
            id: p.contactId,
            contactId: p.contactId,
            requestId,
            firstName: p.name?.split(" ")[0] ?? "",
            lastName: p.name?.split(" ").slice(1).join(" ") ?? "",
            fullName: p.name ?? "",
            jobTitle: p.jobTitle ?? "",
            company: p.companyName ?? "",
            website: p.fqdn ?? "",
            location: "",
            linkedinUrl: "",
            hasEmail: p.hasWorkEmail ?? p.hasEmails ?? false,
            hasPhone: p.hasPhones ?? false,
            industry: "",
            companySize: "",
            revenue: "",
          });
        }
        if (rawPage.length < target) exhausted = true; // last page from Lusha
        page++;
      }

      setProspects(collected);
      setSelectedProspectIds(new Set());
      if (collected.length === 0) {
        toast.info("No leads found matching your filters");
      } else if (collected.length < target) {
        toast.success(
          `Found ${collected.length} new leads (fewer than ${target} available after skipping duplicates)`,
        );
      } else {
        toast.success(`Found ${collected.length} leads`);
      }
      setView("results");
    } catch (e: any) {
      toast.error(e?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleEnrich = async () => {
    const selected = prospects.filter((p) => selectedProspectIds.has(p.id));
    if (selected.length === 0) {
      toast.error("Select leads to enrich");
      return;
    }
    setEnriching(true);
    try {
      // Prospects can come from multiple search pages (backfilling
      // duplicates fetches extra pages), and each page has its own
      // requestId that its contactIds must be enriched against — so batch
      // per requestId rather than assuming one search session for all.
      const byRequestId = new Map<string, LushaProspect[]>();
      for (const p of selected) {
        const group = byRequestId.get(p.requestId) ?? [];
        group.push(p);
        byRequestId.set(p.requestId, group);
      }

      const enrichedContacts: any[] = [];
      for (const [requestId, group] of byRequestId) {
        const { data, error } = await supabase.functions.invoke("lusha-proxy", {
          body: {
            action: "enrich",
            requestId,
            contactIds: group.map((p) => p.contactId),
          },
        });
        if (error) throw new Error(error.message);
        enrichedContacts.push(...(data?.contacts ?? []));
      }

      const prospectMap = new Map(prospects.map((p) => [p.contactId, p]));
      const enriched: WizardLead[] = await Promise.all(
        enrichedContacts.map(async (c: any) => {
          const d = c.data ?? c;
          const p = prospectMap.get(c.id ?? c.contactId);
          const email = d.emailAddresses?.[0]?.email ?? d.emailAddresses?.[0]?.address ?? "";
          const phone = d.phoneNumbers?.[0]?.number ?? "";
          let nb_result: string | null = null;
          let email_valid: boolean | null = null;
          if (email) {
            try {
              const { data: nbData } = await supabase.functions.invoke(
                "neverbounce-proxy",
                { body: { action: "verify", email } },
              );
              if (nbData?.nb_result) {
                nb_result = nbData.nb_result;
                email_valid = nbData.email_valid;
              }
            } catch {}
          }
          const fullName = p?.fullName ?? d.fullName ?? "";
          return {
            id: p?.contactId ?? c.id ?? c.contactId ?? undefined,
            email: email || `${fullName.replace(/\s+/g, ".")}@unknown.com`,
            first_name: p?.firstName ?? d.firstName ?? "",
            last_name: p?.lastName ?? d.lastName ?? "",
            full_name: fullName,
            company: p?.company ?? d.companyName ?? d.company?.name ?? "",
            job_title: p?.jobTitle ?? d.jobTitle ?? "",
            phone: phone || undefined,
            location: p?.location ?? (d.location ? `${d.location.city ?? ""} ${d.location.state ?? ""} ${d.location.country ?? ""}`.trim() : ""),
            linkedin_url: p?.linkedinUrl ?? d.socialLinks?.linkedin ?? "",
            website: p?.website ?? d.company?.fqdn ?? "",
            nb_result,
            email_valid,
            has_work_email: !!email,
            has_phones: !!phone,
          };
        }),
      );

      setState((p) => ({
        ...p,
        leads: enriched,
        selectedLeadIds: new Set(enriched.map((_, i) => String(i))),
      }));
      toast.success(`${enriched.length} leads enriched`);
    } catch (e: any) {
      toast.error(e?.message || "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  if (view === "results" && prospects.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {prospects.length} leads found. Select leads to enrich.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setView("filters")}>
            ← New search
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      selectedProspectIds.size === prospects.length &&
                      prospects.length > 0
                    }
                    onCheckedChange={(v) => {
                      if (v)
                        setSelectedProspectIds(
                          new Set(prospects.map((p) => p.id)),
                        );
                      else setSelectedProspectIds(new Set());
                    }}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Has Email</TableHead>
                <TableHead>Has Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prospects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedProspectIds.has(p.id)}
                      onCheckedChange={() => {
                        const ns = new Set(selectedProspectIds);
                        if (ns.has(p.id)) ns.delete(p.id);
                        else ns.add(p.id);
                        setSelectedProspectIds(ns);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{p.fullName}</TableCell>
                  <TableCell>{p.jobTitle}</TableCell>
                  <TableCell>{p.company}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.website}
                  </TableCell>
                  <TableCell>
                    {p.hasEmail ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </TableCell>
                  <TableCell>
                    {p.hasPhone ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleEnrich}
            disabled={selectedProspectIds.size === 0 || enriching}
          >
            {enriching ? <Spinner /> : <Mail className="h-4 w-4" />}
            Enrich Selected ({selectedProspectIds.size})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Company Name Autocomplete */}
      <AutocompleteField
        label="Company Name"
        icon={<Building2 className="h-4 w-4" />}
        value={companyQuery}
        onChange={(v) => {
          setCompanyQuery(v);
          setState((p) => ({
            ...p,
            lushaFilters: { ...p.lushaFilters, company_name: v },
          }));
          clearTimeout(companyTimeout.current);
          companyTimeout.current = setTimeout(
            () =>
              autocomplete("autocomplete-companies", v, setCompanySuggestions),
            300,
          );
        }}
        suggestions={companySuggestions}
        onSelect={(s) => {
          setCompanyQuery(s.name);
          setCompanySuggestions([]);
          setState((p) => ({
            ...p,
            lushaFilters: { ...p.lushaFilters, company_name: s.name },
          }));
        }}
        placeholder="Search company name..."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Industry */}
        <div className="space-y-1.5">
          <Label>Industry</Label>
          <Select
            value={filters.industry ?? ""}
            onChange={(e) =>
              setState((p) => ({
                ...p,
                lushaFilters: { ...p.lushaFilters, industry: e.target.value },
              }))
            }
          >
            <option value="">Any industry</option>
            {(filterOptions?.industries ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} {o.count != null ? `(${o.count})` : ""}
              </option>
            ))}
          </Select>
        </div>

        {/* Revenue */}
        <div className="space-y-1.5">
          <Label>Revenue</Label>
          <Select
            value={filters.revenue ?? ""}
            onChange={(e) =>
              setState((p) => ({
                ...p,
                lushaFilters: { ...p.lushaFilters, revenue: e.target.value },
              }))
            }
          >
            <option value="">Any revenue</option>
            {(filterOptions?.revenues ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Company Size Checkboxes */}
      <div className="space-y-1.5">
        <Label>Company Size</Label>
        {!filterOptions?.companySizes?.length ? (
          <p className="text-xs text-muted-foreground">Loading sizes...</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {filterOptions.companySizes.map((s) => {
              const checked = filters.company_sizes?.includes(s.id) ?? false;
              return (
                <label key={s.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      const current = filters.company_sizes ?? [];
                      const next = checked
                        ? current.filter((id) => id !== s.id)
                        : [...current, s.id];
                      setState((p) => ({
                        ...p,
                        lushaFilters: {
                          ...p.lushaFilters,
                          company_sizes: next,
                        },
                      }));
                    }}
                  />
                  {s.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Location Autocomplete */}
      <AutocompleteField
        label="Location"
        icon={<MapPin className="h-4 w-4" />}
        value={locationQuery}
        onChange={(v) => {
          setLocationQuery(v);
          clearTimeout(locationTimeout.current);
          locationTimeout.current = setTimeout(
            () =>
              autocomplete("autocomplete-locations", v, setLocationSuggestions),
            300,
          );
        }}
        suggestions={locationSuggestions}
        onSelect={(s) => {
          setLocationQuery(s.name);
          setLocationSuggestions([]);
          setState((p) => ({
            ...p,
            lushaFilters: { ...p.lushaFilters, location: s.name },
          }));
        }}
        placeholder="Search location..."
      />

      {/* Technologies Autocomplete */}
      <div className="space-y-1.5">
        <Label>Technologies</Label>
        <div className="flex flex-wrap gap-1.5">
          {(filters.technologies ?? []).map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              <Cpu className="h-3 w-3" />
              {t}
              <button
                type="button"
                onClick={() =>
                  setState((p) => ({
                    ...p,
                    lushaFilters: {
                      ...p.lushaFilters,
                      technologies: (p.lushaFilters.technologies ?? []).filter(
                        (_, j) => j !== i,
                      ),
                    },
                  }))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <Input
            value={techQuery}
            onChange={(e) => {
              setTechQuery(e.target.value);
              clearTimeout(techTimeout.current);
              techTimeout.current = setTimeout(
                () =>
                  autocomplete(
                    "autocomplete-technologies",
                    e.target.value,
                    setTechSuggestions,
                  ),
                300,
              );
            }}
            placeholder="Type to search technologies..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && techQuery.trim()) {
                e.preventDefault();
                const current = filters.technologies ?? [];
                if (!current.includes(techQuery.trim())) {
                  setState((p) => ({
                    ...p,
                    lushaFilters: {
                      ...p.lushaFilters,
                      technologies: [
                        ...(p.lushaFilters.technologies ?? []),
                        techQuery.trim(),
                      ],
                    },
                  }));
                }
                setTechQuery("");
                setTechSuggestions([]);
              }
            }}
          />
          {techSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
              {techSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const current = filters.technologies ?? [];
                    if (!current.includes(s.name)) {
                      setState((p) => ({
                        ...p,
                        lushaFilters: {
                          ...p.lushaFilters,
                          technologies: [
                            ...(p.lushaFilters.technologies ?? []),
                            s.name,
                          ],
                        },
                      }));
                    }
                    setTechQuery("");
                    setTechSuggestions([]);
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Job Titles Tags */}
      <div className="space-y-1.5">
        <Label>Job Titles</Label>
        <div className="flex flex-wrap gap-1.5">
          {(filters.job_titles ?? []).map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
            >
              <Briefcase className="h-3 w-3" />
              {t}
              <button
                type="button"
                onClick={() =>
                  setState((p) => ({
                    ...p,
                    lushaFilters: {
                      ...p.lushaFilters,
                      job_titles: (p.lushaFilters.job_titles ?? []).filter(
                        (_, j) => j !== i,
                      ),
                    },
                  }))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <Input
            value={jobTitleInput}
            onChange={(e) => {
              setJobTitleInput(e.target.value);
              clearTimeout(jobTitleTimeout.current);
              // For job titles we use free-text + search from Lusha
              jobTitleTimeout.current = setTimeout(
                () =>
                  autocomplete(
                    "autocomplete-technologies",
                    e.target.value,
                    setJobTitleSuggestions,
                  ),
                300,
              );
            }}
            placeholder="Type job title and press Enter..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && jobTitleInput.trim()) {
                e.preventDefault();
                const current = filters.job_titles ?? [];
                if (!current.includes(jobTitleInput.trim())) {
                  setState((p) => ({
                    ...p,
                    lushaFilters: {
                      ...p.lushaFilters,
                      job_titles: [
                        ...(p.lushaFilters.job_titles ?? []),
                        jobTitleInput.trim(),
                      ],
                    },
                  }));
                }
                setJobTitleInput("");
                setJobTitleSuggestions([]);
              }
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Department */}
        <div className="space-y-1.5">
          <Label>Department</Label>
          <Select
            value={filters.department ?? ""}
            onChange={(e) =>
              setState((p) => ({
                ...p,
                lushaFilters: { ...p.lushaFilters, department: e.target.value },
              }))
            }
          >
            <option value="">Any department</option>
            {(filterOptions?.departments ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Contact Location */}
        <div className="space-y-1.5">
          <Label>Contact Location</Label>
          <Input
            value={filters.contact_location ?? ""}
            onChange={(e) =>
              setState((p) => ({
                ...p,
                lushaFilters: {
                  ...p.lushaFilters,
                  contact_location: e.target.value,
                },
              }))
            }
            placeholder="e.g. United States"
          />
        </div>
      </div>

      {/* Seniority Checkboxes */}
      <div className="space-y-1.5">
        <Label>Seniority</Label>
        {!filterOptions?.seniorities?.length ? (
          <p className="text-xs text-muted-foreground">
            Loading seniority levels...
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {filterOptions.seniorities.map((s) => {
              const checked = filters.seniorities?.includes(s.id) ?? false;
              return (
                <label key={s.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      const current = filters.seniorities ?? [];
                      const next = checked
                        ? current.filter((id) => id !== s.id)
                        : [...current, s.id];
                      setState((p) => ({
                        ...p,
                        lushaFilters: { ...p.lushaFilters, seniorities: next },
                      }));
                    }}
                  />
                  {s.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Data Points Checkboxes */}
      <div className="space-y-1.5">
        <Label>Data Points to Include</Label>
        <div className="flex flex-wrap gap-3">
          {[
            { id: "email", name: "Email" },
            { id: "phone", name: "Phone" },
            { id: "company", name: "Company" },
            { id: "job_title", name: "Job Title" },
            { id: "location", name: "Location" },
            { id: "industry", name: "Industry" },
            { id: "linkedin_url", name: "LinkedIn URL" },
          ].map((dp) => {
            const checked = filters.data_points?.includes(dp.id) ?? true;
            return (
              <label key={dp.id} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => {
                    const current = filters.data_points ?? [
                      "email",
                      "phone",
                      "company",
                      "job_title",
                      "location",
                      "industry",
                      "linkedin_url",
                    ];
                    const next = checked
                      ? current.filter((id) => id !== dp.id)
                      : [...current, dp.id];
                    setState((p) => ({
                      ...p,
                      lushaFilters: { ...p.lushaFilters, data_points: next },
                    }));
                  }}
                />
                {dp.name}
              </label>
            );
          })}
        </div>
      </div>

      {/* Max Leads */}
      <div className="space-y-1.5">
        <Label htmlFor="max-leads">Max Leads</Label>
        <Input
          id="max-leads"
          type="number"
          min={1}
          max={500}
          value={filters.max_leads}
          onChange={(e) =>
            setState((p) => ({
              ...p,
              lushaFilters: {
                ...p.lushaFilters,
                max_leads: Number(e.target.value) || 100,
              },
            }))
          }
          className="max-w-[140px]"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSearch} disabled={searching} size="lg">
          {searching ? <Spinner /> : <Search className="h-4 w-4" />}
          Search Leads
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Autocomplete Field ───────────────────────────────────────────────────────

function AutocompleteField({
  label,
  icon,
  value,
  onChange,
  suggestions,
  onSelect,
  placeholder,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  suggestions: LushaFilterOption[];
  onSelect: (s: LushaFilterOption) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </div>
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="pl-9"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
              >
                {icon}
                <span>{s.name}</span>
                {s.count != null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {s.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
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

    // Run NeverBounce if enabled
    if (verify) {
      setVerifying(true);
      try {
        const verified = await Promise.all(
          leads.map(async (l) => {
            try {
              const { data, error } = await supabase.functions.invoke(
                "neverbounce-proxy",
                {
                  body: { action: "verify", email: l.email },
                },
              );
              if (!error && data?.nb_result) {
                return {
                  ...l,
                  nb_result: data.nb_result,
                  email_valid: data.email_valid,
                };
              }
            } catch {}
            return { ...l, nb_result: "skipped", email_valid: null };
          }),
        );
        leads = verified;
      } catch {}
      setVerifying(false);
    }

    setState((p) => ({
      ...p,
      leads,
      selectedLeadIds: new Set(leads.map((_, i) => String(i))),
    }));
    toast.success(
      `${leads.length} leads loaded${verify ? " and verified" : ""}`,
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
                  <TableHead>NB Status</TableHead>
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
              hint="Run NeverBounce on each email during import."
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
