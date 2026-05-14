// Supabase Edge Function: lusha-search
//
// Provides a server-side proxy for the Lusha Prospecting API:
//   GET  /filter-options  — fetch available filter values (industries, sizes, etc.)
//   POST /search          — search prospects with filters
//   POST /enrich          — enrich a single contact
//
// Deploy:
//   supabase functions deploy lusha-search
//   supabase secrets set LUSHA_API_KEY=...
//
// Invoke from the app:
//   supabase.functions.invoke("lusha-search", { body: { action: "search", filters: {...} } })

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LUSHA_API = "https://api.lusha.com";

function getLushaApiKey(): string {
  const key = Deno.env.get("LUSHA_API_KEY");
  if (!key) throw new Error("LUSHA_API_KEY not configured");
  return key;
}

async function lushaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = getLushaApiKey();
  return fetch(`${LUSHA_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      api_key: apiKey,
      ...(init.headers ?? {}),
    },
  });
}

async function handleFilterOptions(): Promise<Response> {
  const [industries, companySizes, revenues, departments, seniorities] = await Promise.all([
    lushaFetch("/prospecting/filters/companies/industries").then((r) => r.json()),
    lushaFetch("/prospecting/filters/companies/sizes").then((r) => r.json()),
    lushaFetch("/prospecting/filters/companies/revenues").then((r) => r.json()),
    lushaFetch("/prospecting/filters/contacts/departments").then((r) => r.json()),
    lushaFetch("/prospecting/filters/contacts/seniorities").then((r) => r.json()),
  ]);

  return json({
    industries: Array.isArray(industries) ? industries : [],
    companySizes: Array.isArray(companySizes) ? companySizes : [],
    revenues: Array.isArray(revenues) ? revenues : [],
    departments: Array.isArray(departments) ? departments : [],
    seniorities: Array.isArray(seniorities) ? seniorities : [],
  });
}

async function handleSearch(body: any): Promise<Response> {
  const filters: Record<string, any> = {};

  if (body.company_name) filters.companyName = body.company_name;
  if (body.industry) filters.industryId = body.industry;
  if (body.company_sizes?.length) filters.companySizeIds = body.company_sizes;
  if (body.location) filters.location = body.location;
  if (body.revenue) filters.revenueId = body.revenue;
  if (body.technologies?.length) filters.technologyNames = body.technologies;
  if (body.job_titles?.length) filters.jobTitleNames = body.job_titles;
  if (body.department) filters.departmentId = body.department;
  if (body.seniorities?.length) filters.seniorityIds = body.seniorities;
  if (body.contact_location) filters.contactLocation = body.contact_location;

  const maxLeads = Math.min(body.max_leads || 100, 500);

  const payload: Record<string, any> = {
    fuzzySearch: true,
    limit: maxLeads,
  };
  if (Object.keys(filters).length > 0) payload.filters = filters;

  const res = await lushaFetch("/prospecting/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return json({ error: `Lusha search failed (${res.status}): ${text.slice(0, 300)}` }, 502);
  }

  const data = await res.json();
  return json({ prospects: data.contacts ?? data ?? [] });
}

async function handleEnrich(body: any): Promise<Response> {
  const { email, firstName, lastName, company } = body;
  if (!email && !firstName && !lastName) {
    return json({ error: "email or firstName+lastName required" }, 400);
  }

  const payload: Record<string, string> = {};
  if (email) payload.email = email;
  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (company) payload.company = company;

  const res = await lushaFetch("/prospecting/contacts/enrich", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    if (res.status === 404) return json({ enriched: false });
    const text = await res.text();
    return json({ error: `Lusha enrich failed (${res.status}): ${text.slice(0, 300)}` }, 502);
  }

  const data = await res.json();
  return json({ enriched: true, contact: data });
}

async function handleAutocomplete(action: string, query: string): Promise<Response> {
  if (!query || query.length < 2) return json({ results: [] });

  let path = "";
  if (action === "autocomplete-companies") path = "/prospecting/filters/companies/autocomplete";
  else if (action === "autocomplete-locations") path = "/prospecting/filters/locations/autocomplete";
  else if (action === "autocomplete-technologies") path = "/prospecting/filters/technologies/autocomplete";
  else return json({ error: "Unknown autocomplete action" }, 400);

  const res = await lushaFetch(`${path}?q=${encodeURIComponent(query)}`);
  if (!res.ok) return json({ results: [] });

  const data = await res.json();
  return json({ results: Array.isArray(data) ? data : data?.results ?? [] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Supabase env vars missing" }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: auth } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case "filter-options":
        return await handleFilterOptions();
      case "search":
        return await handleSearch(body);
      case "enrich":
        return await handleEnrich(body);
      case "autocomplete-companies":
      case "autocomplete-locations":
      case "autocomplete-technologies":
        return await handleAutocomplete(action, body.query || "");
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
