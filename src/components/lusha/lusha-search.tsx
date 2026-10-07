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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";
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
import {
  DEFAULT_LUSHA_FILTERS,
  type LushaFilterOption,
  type LushaFilters,
  type LushaProspect,
} from "@/lib/lusha";
import type { LeadDraft } from "@/lib/leads";
import {
  DEFAULT_LOCATIONS,
  DEFAULT_TECHNOLOGIES,
  DEFAULT_JOB_TITLES,
} from "@/lib/lusha-defaults";

/** The contact's department, whichever field Lusha put it in. */
function lushaDepartment(d: any): string | undefined {
  const raw = d?.departments ?? d?.department ?? d?.jobDepartment ?? d?.companyDepartment;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return undefined;
  const name = typeof first === "string" ? first : (first.name ?? first.value ?? "");
  return String(name).trim() || undefined;
}

/**
 * Calls lusha-proxy and returns its data, or throws Lusha's own reason.
 *
 * supabase.functions.invoke turns any non-2xx into a generic "Edge
 * Function returned a non-2xx status code"; the proxy's actual error —
 * expired search, out of credits — is in the response body, so it's read
 * from there, and Lusha's sentence is pulled out of the JSON it wraps.
 */
async function callLusha(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("lusha-proxy", { body });
  if (!error) return data;
  let message: string = error.message || "Lusha request failed";
  const ctx = (error as any).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = await ctx.json();
      if (b?.error) message = String(b.error);
    } catch {
      // body wasn't JSON; keep the generic message
    }
  }
  const lusha = /"message"\s*:\s*"([^"]+)"/.exec(message);
  throw new Error(lusha ? lusha[1] : message);
}

/** Lusha's answer when a search's requestId is too old to enrich against. */
const isExpiredSearch = (e: unknown) =>
  /not found or expired|perform a search first/i.test(String((e as Error)?.message ?? e));

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
  // The filters and page each result came from, so an enrich whose search
  // has expired can re-run that page for a fresh requestId.
  const searchedFilters = useRef<LushaFilters | null>(null);
  const pageOf = useRef(new Map<string, number>());
  const [selectedProspectIds, setSelectedProspectIds] = useState<Set<string>>(
    new Set(),
  );

  // Fetch filter options on mount, and again on "Retry" if Lusha was down.
  const [optionsFailed, setOptionsFailed] = useState(false);
  const loadFilterOptions = useCallback(() => {
    setOptionsFailed(false);
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
        } else {
          setOptionsFailed(true);
        }
      } catch {
        setOptionsFailed(true);
      }
    })();
  }, []);
  useEffect(loadFilterOptions, [loadFilterOptions]);



  // Autocomplete lookups. Each returns the options to offer for a query;
  // the fields themselves own their text, debouncing and selection.
  const lookup = useCallback(
    async (action: string, query: string): Promise<LushaFilterOption[]> => {
      try {
        const { data, error } = await supabase.functions.invoke("lusha-proxy", {
          body: { action, query },
        });
        return !error && data?.results ? data.results : [];
      } catch {
        return [];
      }
    },
    [],
  );

  // Lusha's location filter matches by country only, so a suggestion like
  // "Cairo, Egypt" used to search all of Egypt while reading as Cairo.
  // Offer countries, and only countries — what you pick is what's searched.
  const lookupCountries = useCallback(
    async (action: string, query: string): Promise<LushaFilterOption[]> => {
      const q = query.toLowerCase();
      const names = DEFAULT_LOCATIONS.filter((o) =>
        o.name.toLowerCase().includes(q),
      ).map((o) => o.name);
      for (const o of await lookup(action, query)) {
        if (o.id && !names.includes(o.id)) names.push(o.id);
      }
      return names.map((name) => ({ id: name, name }));
    },
    [lookup],
  );

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
        const data = await callLusha({
          action: "search",
          ...filters,
          max_leads: PAGE_SIZE,
          page,
        });

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
          pageOf.current.set(p.contactId, page);
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

      searchedFilters.current = filters;
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
      const enrich = async (requestId: string, group: LushaProspect[]) => {
        const data = await callLusha({
          action: "enrich",
          requestId,
          contactIds: group.map((p) => p.contactId),
        });
        enrichedContacts.push(...(data?.contacts ?? []));
      };
      let lost = 0;
      for (const [requestId, group] of byRequestId) {
        try {
          await enrich(requestId, group);
        } catch (e) {
          // Lusha only enriches against a recent search. Picking leads
          // for a while outlives it, so re-run the page these came from
          // for a fresh requestId and enrich the same contacts against it.
          if (!isExpiredSearch(e) || !searchedFilters.current) throw e;
          const fresh = await callLusha({
            action: "search",
            ...searchedFilters.current,
            max_leads: 50,
            page: pageOf.current.get(group[0].contactId) ?? 0,
          });
          const stillThere = new Set(
            (fresh?.prospects ?? []).map((p: any) => p.contactId),
          );
          const again = group.filter((p) => stillThere.has(p.contactId));
          lost += group.length - again.length;
          if (again.length > 0) await enrich(fresh.requestId, again);
        }
      }
      if (lost > 0) {
        toast.warning(
          `${lost} lead${lost === 1 ? " is" : "s are"} no longer in Lusha's results and weren't enriched — search again to find them.`,
        );
      }

      // A contact Lusha couldn't reveal (no credits left, say) comes back
      // marked unsuccessful rather than failing the whole call.
      const failed = enrichedContacts.filter((c: any) => c?.isSuccess === false);
      if (failed.length > 0 && failed.length === enrichedContacts.length) {
        const why = failed[0]?.error?.message ?? failed[0]?.error;
        throw new Error(
          `Lusha couldn't reveal ${failed.length === 1 ? "this lead" : `these ${failed.length} leads`}` +
            (why ? `: ${typeof why === "string" ? why : JSON.stringify(why)}` : "."),
        );
      }
      if (enrichedContacts.length === 0) {
        throw new Error("Lusha returned no contacts for this selection — search again and retry.");
      }
      if (failed.length > 0) {
        toast.warning(
          `Lusha couldn't reveal ${failed.length} of the selected leads — they were left out.`,
        );
      }
      const revealed = enrichedContacts.filter((c: any) => c?.isSuccess !== false);

      const prospectMap = new Map(prospects.map((p) => [p.contactId, p]));
      const mapped: LeadDraft[] = revealed.map((c: any) => {
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
          // Lusha's wording varies by endpoint version, so each spelling
          // it has used is read in turn; a department list collapses to
          // its first entry, which is the contact's primary one.
          department: lushaDepartment(d),
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
      toast.error(`Enrichment failed: ${e?.message || "unknown error"}`, {
        duration: 10000,
      });
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

  const loadingNote = (what: string) =>
    optionsFailed ? (
      <p className="flex h-9 items-center text-xs text-muted-foreground">
        Couldn't load {what} from Lusha.&nbsp;
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={loadFilterOptions}
        >
          Retry
        </button>
      </p>
    ) : (
      <p className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
        <Spinner /> Loading {what}...
      </p>
    );

  return (
    <div className="space-y-5">
      <FormSection icon={<Users className="h-4 w-4 text-primary" />} title="Who">
        <ComboField
          label="Job Titles"
          icon={<Briefcase className="h-4 w-4" />}
          tooltip="Pick from the list, or type any title and press Enter. Results match ANY of them."
          placeholder="e.g. Sales Manager — pick or press Enter"
          multiple
          freeText
          values={filters.job_titles ?? []}
          onChange={(next) => setFilters((f) => ({ ...f, job_titles: next }))}
          seeds={DEFAULT_JOB_TITLES}
          search={(q) => lookup("autocomplete-job-titles", q)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Department</Label>
              <InfoTooltip text="Select one or more departments. Results include contacts from ANY of them." />
            </div>
            {!filterOptions?.departments?.length ? (
              loadingNote("departments")
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

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Seniority</Label>
              <InfoTooltip text="Select one or more seniority levels. Results include ANY of the selected levels." />
            </div>
            {!filterOptions?.seniorities?.length ? (
              loadingNote("seniority levels")
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
        </div>

        <ComboField
          label="Contact Country"
          icon={<MapPin className="h-4 w-4" />}
          tooltip="Where the person is based. This is the filter that keeps results inside one country."
          placeholder="Click to pick a country..."
          values={filters.contact_location ? [filters.contact_location] : []}
          onChange={(next) =>
            setFilters((f) => ({ ...f, contact_location: next[0] ?? "" }))
          }
          seeds={DEFAULT_LOCATIONS}
          search={(q) => lookupCountries("autocomplete-contact-locations", q)}
        />

        <ComboField
          label="Person Name"
          icon={<User className="h-4 w-4" />}
          tooltip="Looking for someone specific? Type their name and press Enter. Pair it with a company name for the best chance of a single, exact match."
          placeholder="e.g. Omar Essam — press Enter to add"
          multiple
          freeText
          values={filters.contact_names ?? []}
          onChange={(next) => setFilters((f) => ({ ...f, contact_names: next }))}
        />
      </FormSection>

      <FormSection
        icon={<Building2 className="h-4 w-4 text-primary" />}
        title="Company"
      >
        <ComboField
          label="Company Name"
          icon={<Building2 className="h-4 w-4" />}
          placeholder="Search company name..."
          freeText
          values={filters.company_name ? [filters.company_name] : []}
          onChange={(next) =>
            setFilters((f) => ({ ...f, company_name: next[0] ?? "" }))
          }
          search={(q) => lookup("autocomplete-companies", q)}
        />

        <ComboField
          label="Company HQ Country"
          icon={<MapPin className="h-4 w-4" />}
          tooltip="Where the company is headquartered. Its staff can be anywhere — to get people in a country, use Contact Country."
          placeholder="Click to pick a country..."
          values={filters.location ? [filters.location] : []}
          onChange={(next) =>
            setFilters((f) => ({ ...f, location: next[0] ?? "" }))
          }
          seeds={DEFAULT_LOCATIONS}
          search={(q) => lookupCountries("autocomplete-locations", q)}
          hint={
            filters.location &&
            filters.contact_location !== filters.location && (
              <p className="text-xs text-amber-600">
                {filters.contact_location
                  ? `Contacts are filtered to ${filters.contact_location}, companies to ${filters.location}.`
                  : "This only filters where companies are based — their people can be in other countries."}{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() =>
                    setFilters((f) => ({ ...f, contact_location: f.location }))
                  }
                >
                  Only people in {filters.location}
                </button>
              </p>
            )
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Industry</Label>
            {!filterOptions?.industries?.length ? (
              loadingNote("industries")
            ) : (
              <MultiSelectDropdown
                single
                icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
                options={filterOptions.industries}
                selected={filters.industry ? [filters.industry] : []}
                onChange={(next) =>
                  setFilters((f) => ({ ...f, industry: next[0] ?? "" }))
                }
                placeholder="Any industry"
              />
            )}
          </div>

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

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Company Size</Label>
            <InfoTooltip text="Select one or more employee-count ranges. Results match ANY of the selected ranges." />
          </div>
          {!filterOptions?.companySizes?.length ? (
            loadingNote("sizes")
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

        <ComboField
          label="Technologies"
          icon={<Cpu className="h-4 w-4" />}
          placeholder="Click to browse or search technologies..."
          multiple
          values={filters.technologies ?? []}
          onChange={(next) => setFilters((f) => ({ ...f, technologies: next }))}
          seeds={DEFAULT_TECHNOLOGIES}
          search={(q) => lookup("autocomplete-technologies", q)}
        />
      </FormSection>

      <FormSection
        icon={<SlidersHorizontal className="h-4 w-4 text-primary" />}
        title="Search Settings"
      >
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

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setFilters((f) => ({ ...DEFAULT_LUSHA_FILTERS, max_leads: f.max_leads }))
          }
        >
          Clear all filters
        </Button>
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

// ─── Combo Field ──────────────────────────────────────────────────────────────

/**
 * A text box with a pick list: click to browse, type to search, arrows +
 * Enter or a click to pick. What's applied shows as chips (one chip, for a
 * single-value field), so it's never unclear whether a filter is on.
 *
 * The list keeps focus in the input while it's clicked — the old fields
 * closed their list 200ms after blur, so any slower click missed. Text
 * that was typed but never picked is applied on blur when it matches an
 * option exactly (or always, for free-text fields), and is flagged
 * otherwise instead of being silently left out of the search.
 */
function ComboField({
  label,
  icon,
  tooltip,
  placeholder,
  values,
  onChange,
  multiple = false,
  freeText = false,
  seeds = [],
  search,
  hint,
}: {
  label: string;
  icon: ReactNode;
  tooltip?: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  /** Typed text is a valid value on its own (titles, names, companies). */
  freeText?: boolean;
  /** Shown instantly, before 2 characters are typed for a live lookup. */
  seeds?: LushaFilterOption[];
  search?: (query: string) => Promise<LushaFilterOption[]>;
  hint?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LushaFilterOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const seedsFor = (q: string) =>
    q
      ? seeds.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
      : seeds;

  const refresh = (q: string) => {
    latest.current = q;
    clearTimeout(timer.current);
    setActive(freeText ? -1 : 0);
    setSuggestions(seedsFor(q));
    if (!search || q.trim().length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const found = await search(q.trim());
      if (latest.current !== q) return;
      if (found.length) setSuggestions(found);
      setLoading(false);
    }, 300);
  };

  const add = (name: string) => {
    const v = name.trim();
    if (!v) return;
    onChange(multiple ? (values.includes(v) ? values : [...values, v]) : [v]);
    setQuery("");
    latest.current = "";
    clearTimeout(timer.current);
    setLoading(false);
    setSuggestions([]);
    setOpen(false);
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const shown = suggestions.filter((o) => !values.includes(o.name));

  const exactMatch = (q: string) =>
    [...suggestions, ...seeds].find(
      (o) => o.name.toLowerCase() === q.trim().toLowerCase(),
    );

  // Typed text the user didn't pick from the list.
  const commitTyped = () => {
    const q = query.trim();
    if (!q) return;
    const exact = exactMatch(q);
    if (exact) add(exact.name);
    else if (freeText) add(q);
  };

  const pending = !open && query.trim() !== "" && !freeText;
  const singleApplied = !multiple && values.length > 0;
  const offerTyped = freeText && query.trim() !== "" && !exactMatch(query);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>

      {multiple && values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary [&_svg]:h-3 [&_svg]:w-3"
            >
              {icon}
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                className="rounded-full hover:bg-primary/20"
                onClick={() => remove(v)}
              >
                <X />
              </button>
            </span>
          ))}
        </div>
      )}

      {singleApplied ? (
        <div className="flex h-9 items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 text-sm">
          <span className="text-primary">{icon}</span>
          <span className="flex-1 truncate font-medium">{values[0]}</span>
          <button
            type="button"
            aria-label={`Clear ${label}`}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              onChange([]);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
          <Input
            ref={inputRef}
            value={query}
            placeholder={placeholder}
            className={cn("pl-9", pending && "border-amber-500")}
            onFocus={() => {
              refresh(query);
              setOpen(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              refresh(e.target.value);
              setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
              commitTyped();
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((i) => Math.min(i + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, freeText ? -1 : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (open && shown[active]) add(shown[active].name);
                else commitTyped();
              } else if (e.key === "Escape") {
                setOpen(false);
              } else if (
                e.key === "Backspace" &&
                !query &&
                multiple &&
                values.length > 0
              ) {
                remove(values[values.length - 1]);
              }
            }}
          />
          {open && (shown.length > 0 || loading || offerTyped || query.trim().length >= 2) && (
            <div
              className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg"
              // Keeps focus in the input, so a click never races its blur.
              onMouseDown={(e) => e.preventDefault()}
            >
              {offerTyped && (
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    active === -1 && "bg-muted",
                  )}
                  onMouseEnter={() => setActive(-1)}
                  onClick={() => add(query)}
                >
                  <span>
                    Use "<span className="font-medium">{query.trim()}</span>"
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">Enter</span>
                </button>
              )}
              {shown.map((s, i) => (
                <button
                  key={`${s.id}-${i}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    i === active && "bg-muted",
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(s.name)}
                >
                  <span className="text-muted-foreground">{icon}</span>
                  <span className="truncate">{s.name}</span>
                  {s.count != null && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {s.count}
                    </span>
                  )}
                </button>
              ))}
              {loading ? (
                <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Spinner /> Searching Lusha...
                </p>
              ) : (
                shown.length === 0 &&
                !offerTyped && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    No matches for "{query.trim()}"
                  </p>
                )
              )}
            </div>
          )}
        </div>
      )}

      {pending && (
        <p className="text-xs text-amber-600">
          "{query.trim()}" isn't applied — pick one from the list.
        </p>
      )}
      {hint}
    </div>
  );
}
