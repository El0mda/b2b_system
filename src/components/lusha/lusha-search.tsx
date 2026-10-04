// The Lusha prospect search: filters, results, reveal + verify.
//
// Used in two places, with the same filters and the same paging rules:
//   * the campaign wizard's Search/Import step, which keeps the revealed
//     leads in wizard state and carries them to launch;
//   * the Find Leads page, which saves them to the Leads list with no
//     campaign attached.
//
// Everything about how Lusha is queried lives here, so those two never
// drift apart. What happens to the leads afterwards is the caller's,
// through onLeads.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  ArrowRight,
  X,
  Check,
  Building2,
  MapPin,
  Cpu,
  Briefcase,
  Mail,
  User,
  Users,
  Layers,
  TrendingUp,
  SlidersHorizontal,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { lookupVerification, verifyEmails } from "@/lib/verify-emails";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { InfoTooltip } from "@/components/ui/tooltip";
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LushaFilterOption, LushaFilters, LushaProspect } from "@/lib/lusha";
import type { LeadDraft } from "@/lib/leads";
import {
  DEFAULT_LOCATIONS,
  DEFAULT_TECHNOLOGIES,
  DEFAULT_JOB_TITLES,
} from "@/lib/lusha-defaults";

export function LushaSearch({
  filters,
  setFilters,
  onLeads,
  actionLabel = "Enrich Selected",
  startInResults = false,
}: {
  filters: LushaFilters;
  setFilters: (updater: (prev: LushaFilters) => LushaFilters) => void;
  /**
   * Called with the revealed, verified leads once the user acts on their
   * selection. Where they go is the caller's business: the campaign
   * wizard keeps them in its own state, the Find Leads page writes them
   * straight to the database.
   */
  onLeads: (leads: LeadDraft[]) => void | Promise<void>;
  actionLabel?: string;
  startInResults?: boolean;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [view, setView] = useState<"filters" | "results">(
    startInResults ? "results" : "filters",
  );
  const [filterOptions, setFilterOptions] = useState<{
    industries: LushaFilterOption[];
    companySizes: LushaFilterOption[];
    revenues: LushaFilterOption[];
    departments: LushaFilterOption[];
    seniorities: LushaFilterOption[];
  } | null>(null);

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
  const [nameInput, setNameInput] = useState("");
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [jobTitleSuggestions, setJobTitleSuggestions] = useState<
    LushaFilterOption[]
  >([]);
  const [contactLocationQuery, setContactLocationQuery] = useState("");
  const [contactLocationSuggestions, setContactLocationSuggestions] =
    useState<LushaFilterOption[]>([]);

  const companyTimeout = useRef<ReturnType<typeof setTimeout>>();
  const locationTimeout = useRef<ReturnType<typeof setTimeout>>();
  const techTimeout = useRef<ReturnType<typeof setTimeout>>();
  const jobTitleTimeout = useRef<ReturnType<typeof setTimeout>>();
  const contactLocationTimeout = useRef<ReturnType<typeof setTimeout>>();


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

  // Below 2 characters Lusha's own search-by-text endpoints return nothing,
  // so short queries (including empty, on focus/click) are served from a
  // small curated starter list instead — filtered client-side as you type,
  // then handed off to the live debounced Lusha search once you hit 2+
  // characters. Keeps these fields feeling like a real dropdown you can
  // click open, rather than one that stays empty until you start typing.
  const seedOrFilter = (defaults: LushaFilterOption[], query: string) =>
    query
      ? defaults.filter((o) =>
          o.name.toLowerCase().includes(query.toLowerCase()),
        )
      : defaults;

  const handleSearch = async () => {
    if (
      !filters.contact_names?.length &&
      !filters.job_titles?.length &&
      !filters.departments?.length &&
      !filters.seniorities?.length &&
      !filters.contact_location
    ) {
      toast.error(
        "Please add at least one contact filter: Name, Job Title, Department, Seniority, or Contact Location",
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
      // Lusha's ranking for broad filters is deterministic (same top
      // companies/contacts every time), so an org that already imported
      // some of that top slice can otherwise dedup its way through a small
      // window and come up empty despite far more matches existing further
      // down the ranking. Request full-size pages (independent of how many
      // *new* leads the user wants) and scan a much larger window before
      // giving up.
      //
      // 50 is Lusha's hard maximum per page — asking for more is rejected
      // outright — so a bigger total means more pages, not bigger ones.
      // Pages are 0-based: starting at 1 skipped the top 50 matches.
      const PAGE_SIZE = 50;
      const MAX_PAGES = 40; // scans up to 2,000 matches while skipping duplicates
      let page = 0;
      let exhausted = false;
      let scannedCount = 0;
      let dedupedCount = 0;

      while (collected.length < target && page < MAX_PAGES && !exhausted) {
        const { data, error } = await supabase.functions.invoke("lusha-proxy", {
          body: { action: "search", ...filters, max_leads: PAGE_SIZE, page },
        });
        if (error) throw new Error(error.message || "Search failed");

        if (data?.nameFilterIgnored && page === 0) {
          // Lusha refused the name filter rather than the whole search
          // (the proxy retried without it), so the results below match
          // every *other* filter but not the name — say so instead of
          // letting it look like a name search that worked.
          toast.warning(
            "Lusha wouldn't search by name here — these results match your other filters only.",
          );
        }
        const rawPage: any[] = data?.prospects ?? [];
        if (rawPage.length === 0) {
          exhausted = true;
          break;
        }
        scannedCount += rawPage.length;

        const requestId = data?.requestId ?? "";
        for (const p of rawPage) {
          if (collected.length >= target) break;
          if (seen.has(p.contactId)) continue;
          seen.add(p.contactId);
          if (existingContactIds.has(p.contactId)) {
            dedupedCount++;
            continue;
          }
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
        if (rawPage.length < PAGE_SIZE) exhausted = true; // last page from Lusha
        page++;
      }

      setProspects(collected);
      setSelectedProspectIds(new Set());
      if (collected.length === 0 && scannedCount > 0 && dedupedCount === scannedCount) {
        toast.info(
          `All ${scannedCount} matching leads found are already in your account — try different filters or broaden your search`,
        );
      } else if (collected.length === 0) {
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
      const mapped: LeadDraft[] = enrichedContacts.map((c: any) => {
        const d = c.data ?? c;
        const p = prospectMap.get(c.id ?? c.contactId);
        const email = d.emailAddresses?.[0]?.email ?? d.emailAddresses?.[0]?.address ?? "";
        const phone = d.phoneNumbers?.[0]?.number ?? "";
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
          nb_result: null,
          email_valid: null,
          has_work_email: !!email,
          has_phones: !!phone,
        };
      });

      // Only real addresses are verified — the placeholder built above
      // for a contact with no email would burn a credit to prove itself
      // undeliverable.
      const verification = await verifyEmails(
        mapped.filter((l) => l.has_work_email).map((l) => l.email),
      );
      const enriched: LeadDraft[] = mapped.map((l) => {
        if (!l.has_work_email) return l;
        const v = lookupVerification(verification, l.email);
        return { ...l, nb_result: v.result, email_valid: v.valid };
      });

      await onLeads(enriched);
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
            {prospects.length} leads found. Select the ones you want.
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
            {actionLabel} ({selectedProspectIds.size})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormSection
        icon={<Building2 className="h-4 w-4 text-primary" />}
        title="Company"
      >
        {/* Company Name Autocomplete */}
        <AutocompleteField
          label="Company Name"
          icon={<Building2 className="h-4 w-4" />}
          value={companyQuery}
          onChange={(v) => {
            setCompanyQuery(v);
            setFilters((f) => ({ ...f, company_name: v }));
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
            setFilters((f) => ({ ...f, company_name: s.name }));
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
                setFilters((f) => ({ ...f, industry: e.target.value }))
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
                setFilters((f) => ({ ...f, revenue: e.target.value }))
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

        {/* Company Size */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Company Size</Label>
            <InfoTooltip text="Select one or more employee-count ranges. Results match ANY of the selected ranges." />
          </div>
          {!filterOptions?.companySizes?.length ? (
            <p className="text-xs text-muted-foreground">Loading sizes...</p>
          ) : (
            <MultiSelectDropdown
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              options={filterOptions.companySizes}
              selected={filters.company_sizes ?? []}
              onChange={(next) =>
                setFilters((f) => ({ ...f, company_sizes: next }))
              }
              placeholder="Any company size"
            />
          )}
        </div>

        {/* Location Autocomplete */}
        <AutocompleteField
          label="Location"
          icon={<MapPin className="h-4 w-4" />}
          value={locationQuery}
          onFocus={() =>
            locationQuery.length < 2 &&
            setLocationSuggestions(seedOrFilter(DEFAULT_LOCATIONS, locationQuery))
          }
          onChange={(v) => {
            setLocationQuery(v);
            clearTimeout(locationTimeout.current);
            if (v.length < 2) {
              setLocationSuggestions(seedOrFilter(DEFAULT_LOCATIONS, v));
              return;
            }
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
            setFilters((f) => ({ ...f, location: s.id }));
          }}
          placeholder="Click to browse or search location..."
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
                    setFilters((f) => ({ ...f, technologies: (f.technologies ?? []).filter( (_, j) => j !== i, ) }))
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
              onFocus={() =>
                techQuery.length < 2 &&
                setTechSuggestions(seedOrFilter(DEFAULT_TECHNOLOGIES, techQuery))
              }
              onChange={(e) => {
                const v = e.target.value;
                setTechQuery(v);
                clearTimeout(techTimeout.current);
                if (v.length < 2) {
                  setTechSuggestions(seedOrFilter(DEFAULT_TECHNOLOGIES, v));
                  return;
                }
                techTimeout.current = setTimeout(
                  () =>
                    autocomplete(
                      "autocomplete-technologies",
                      v,
                      setTechSuggestions,
                    ),
                  300,
                );
              }}
              onBlur={() => setTimeout(() => setTechSuggestions([]), 200)}
              placeholder="Click to browse or search technologies..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && techSuggestions.length > 0) {
                  e.preventDefault();
                  const s = techSuggestions[0];
                  const current = filters.technologies ?? [];
                  if (!current.includes(s.name)) {
                    setFilters((f) => ({ ...f, technologies: [ ...(f.technologies ?? []), s.name, ] }));
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
                        setFilters((f) => ({ ...f, technologies: [ ...(f.technologies ?? []), s.name, ] }));
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
      </FormSection>

      <FormSection icon={<Users className="h-4 w-4 text-primary" />} title="Contact">
        {/* Person Name Tags — for hunting one specific person rather
            than a segment. Lusha has no autocomplete for names, so this
            is plain text: type a name, press Enter. */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Person Name</Label>
            <InfoTooltip text="Looking for someone specific? Type their name and press Enter. Pair it with a company name for the best chance of a single, exact match." />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(filters.contact_names ?? []).map((n, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
              >
                <User className="h-3 w-3" />
                {n}
                <button
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      contact_names: (f.contact_names ?? []).filter((_, j) => j !== i),
                    }))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. Omar Essam — press Enter to add"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const typed = nameInput.trim();
              if (!typed) return;
              setFilters((f) => ({
                ...f,
                contact_names: (f.contact_names ?? []).includes(typed)
                  ? f.contact_names
                  : [...(f.contact_names ?? []), typed],
              }));
              setNameInput("");
            }}
          />
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
                    setFilters((f) => ({ ...f, job_titles: (f.job_titles ?? []).filter( (_, j) => j !== i, ) }))
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
              onFocus={() =>
                jobTitleInput.length < 2 &&
                setJobTitleSuggestions(
                  seedOrFilter(DEFAULT_JOB_TITLES, jobTitleInput),
                )
              }
              onChange={(e) => {
                const v = e.target.value;
                setJobTitleInput(v);
                clearTimeout(jobTitleTimeout.current);
                if (v.length < 2) {
                  setJobTitleSuggestions(seedOrFilter(DEFAULT_JOB_TITLES, v));
                  return;
                }
                jobTitleTimeout.current = setTimeout(
                  () =>
                    autocomplete(
                      "autocomplete-job-titles",
                      v,
                      setJobTitleSuggestions,
                    ),
                  300,
                );
              }}
              onBlur={() => setTimeout(() => setJobTitleSuggestions([]), 200)}
              placeholder="Click to browse or search job titles..."
              onKeyDown={(e) => {
                const typed = jobTitleInput.trim();
                if (e.key === "Enter" && (typed || jobTitleSuggestions.length > 0)) {
                  e.preventDefault();
                  // Enter used to add Lusha's first suggestion, which is often
                  // not what was typed ("general manager" → "General IT
                  // Manager"). Prefer an exact match, then the typed text
                  // itself; fall back to the first suggestion only when
                  // nothing was typed.
                  const exact = jobTitleSuggestions.find(
                    (o) => o.name.toLowerCase() === typed.toLowerCase(),
                  );
                  const title = exact?.name ?? (typed || jobTitleSuggestions[0]?.name);
                  const current = filters.job_titles ?? [];
                  if (title && !current.includes(title)) {
                    setFilters((f) => ({ ...f, job_titles: [...(f.job_titles ?? []), title] }));
                  }
                  setJobTitleInput("");
                  setJobTitleSuggestions([]);
                }
              }}
            />
            {jobTitleSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {jobTitleSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      const current = filters.job_titles ?? [];
                      if (!current.includes(s.name)) {
                        setFilters((f) => ({ ...f, job_titles: [ ...(f.job_titles ?? []), s.name, ] }));
                      }
                      setJobTitleInput("");
                      setJobTitleSuggestions([]);
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Department */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Department</Label>
              <InfoTooltip text="Select one or more departments. Results include contacts from ANY of them." />
            </div>
            {!filterOptions?.departments?.length ? (
              <p className="text-xs text-muted-foreground">
                Loading departments...
              </p>
            ) : (
              <MultiSelectDropdown
                icon={<Layers className="h-4 w-4 text-muted-foreground" />}
                options={filterOptions.departments}
                selected={filters.departments ?? []}
                onChange={(next) =>
                  setFilters((f) => ({ ...f, departments: next }))
                }
                placeholder="Any department"
              />
            )}
          </div>

          {/* Contact Location */}
          <AutocompleteField
            label="Contact Location"
            icon={<MapPin className="h-4 w-4" />}
            value={contactLocationQuery}
            onFocus={() =>
              contactLocationQuery.length < 2 &&
              setContactLocationSuggestions(
                seedOrFilter(DEFAULT_LOCATIONS, contactLocationQuery),
              )
            }
            onChange={(v) => {
              setContactLocationQuery(v);
              clearTimeout(contactLocationTimeout.current);
              if (v.length < 2) {
                setContactLocationSuggestions(seedOrFilter(DEFAULT_LOCATIONS, v));
                return;
              }
              contactLocationTimeout.current = setTimeout(
                () =>
                  autocomplete(
                    "autocomplete-contact-locations",
                    v,
                    setContactLocationSuggestions,
                  ),
                300,
              );
            }}
            suggestions={contactLocationSuggestions}
            onSelect={(s) => {
              setContactLocationQuery(s.name);
              setContactLocationSuggestions([]);
              setFilters((f) => ({ ...f, contact_location: s.id }));
            }}
            placeholder="Click to browse or search location..."
          />
        </div>

        {/* Seniority */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Seniority</Label>
            <InfoTooltip text="Select one or more seniority levels. Results include ANY of the selected levels." />
          </div>
          {!filterOptions?.seniorities?.length ? (
            <p className="text-xs text-muted-foreground">
              Loading seniority levels...
            </p>
          ) : (
            <MultiSelectDropdown
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              options={filterOptions.seniorities}
              selected={filters.seniorities ?? []}
              onChange={(next) =>
                setFilters((f) => ({ ...f, seniorities: next }))
              }
              placeholder="Any seniority"
            />
          )}
        </div>
      </FormSection>

      <FormSection
        icon={<SlidersHorizontal className="h-4 w-4 text-primary" />}
        title="Search Settings"
      >
        {/* Data Points Checkboxes */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Data Points to Include</Label>
            <InfoTooltip text="Choose which fields to include for each returned lead." />
          </div>
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
                      setFilters((f) => ({ ...f, data_points: next }));
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
              setFilters((f) => ({ ...f, max_leads: Number(e.target.value) || 100 }))
            }
            className="max-w-[140px]"
          />
          <p className="text-xs text-muted-foreground">
            Up to 500. Lusha returns 50 per request, so larger numbers are fetched in several
            pages automatically. Each lead you then enrich uses Lusha credits.
          </p>
        </div>
      </FormSection>

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

// ─── Form Section ─────────────────────────────────────────────────────────────

function FormSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Autocomplete Field ───────────────────────────────────────────────────────

function AutocompleteField({
  label,
  icon,
  value,
  onChange,
  onFocus,
  suggestions,
  onSelect,
  placeholder,
  tooltip,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  suggestions: LushaFilterOption[];
  onSelect: (s: LushaFilterOption) => void;
  placeholder?: string;
  tooltip?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
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
          onFocus={() => {
            onFocus?.();
            setOpen(true);
          }}
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
