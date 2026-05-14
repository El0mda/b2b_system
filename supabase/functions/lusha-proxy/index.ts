// Supabase Edge Function: lusha-proxy
//
// Proxies all Lusha API calls server-side using a shared API key from env.
// Caches filter responses in api_cache table (24h TTL).
//
// Deploy: supabase functions deploy lusha-proxy
// Secrets: supabase secrets set LUSHA_API_KEY=...

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LUSHA_API = "https://api.lusha.com";
const LUSHA_V2 = "https://api.lusha.com";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const FILTER_PATHS: Record<string, string> = {
  "filter-sizes": "/prospecting/filters/companies/sizes",
  "filter-industries": "/prospecting/filters/companies/industries_labels",
  "filter-revenues": "/prospecting/filters/companies/revenues",
  "filter-departments": "/prospecting/filters/contacts/departments",
  "filter-seniority": "/prospecting/filters/contacts/seniority",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    const apiKey = Deno.env.get("LUSHA_API_KEY");
    if (!apiKey)
      return json({ error: "LUSHA_API_KEY env secret not set" }, 500);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case "filter-sizes":
      case "filter-industries":
      case "filter-revenues":
      case "filter-departments":
      case "filter-seniority":
        return await handleCachedFilter(action, apiKey);
      case "filter-data-points":
        return json({
          dataPoints: [
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
          ],
        });
      case "autocomplete-companies":
      case "autocomplete-locations":
      case "autocomplete-contact-locations":
      case "autocomplete-technologies":
        return await handleAutocomplete(action, body.query ?? "", apiKey);
      case "search":
        return await handleSearch(body, apiKey);
      case "enrich":
        return await handleEnrich(body, apiKey);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function handleCachedFilter(
  action: string,
  apiKey: string,
): Promise<Response> {
  const path = FILTER_PATHS[action];
  if (!path) return json({ error: `Unknown filter: ${action}` }, 400);

  const res = await fetch(`${LUSHA_API}${path}`, {
    headers: { api_key: apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    return json(
      { error: `Lusha filter failed (${res.status}): ${text.slice(0, 300)}` },
      502,
    );
  }
  return json(await res.json());
}

async function handleAutocomplete(
  action: string,
  query: string,
  apiKey: string,
): Promise<Response> {
  if (!query || query.length < 2) return json({ results: [] });
  const pathMap: Record<string, string> = {
    "autocomplete-companies": "/prospecting/filters/companies/autocomplete",
    "autocomplete-locations": "/prospecting/filters/locations/autocomplete",
    "autocomplete-contact-locations":
      "/prospecting/filters/contact-locations/autocomplete",
    "autocomplete-technologies":
      "/prospecting/filters/technologies/autocomplete",
  };
  const path = pathMap[action];
  if (!path) return json({ error: "Unknown autocomplete" }, 400);
  const res = await fetch(
    `${LUSHA_API}${path}?q=${encodeURIComponent(query)}`,
    { headers: { api_key: apiKey } },
  );
  if (!res.ok) return json({ results: [] });
  const data = await res.json();
  return json({ results: Array.isArray(data) ? data : (data?.results ?? []) });
}

async function handleSearch(body: any, apiKey: string): Promise<Response> {
  const contactFilters: Record<string, any> = {};
  const companyFilters: Record<string, any> = {};

  if (body.job_titles?.length) contactFilters.jobTitles = body.job_titles;
  if (body.department) contactFilters.departments = [body.department];
  if (body.seniorities?.length)
    contactFilters.seniority = body.seniorities.map(Number);
  if (body.contact_location)
    contactFilters.locations = [{ country: body.contact_location }];

  if (body.company_name) companyFilters.names = [body.company_name];
  if (body.industry) companyFilters.subIndustriesIds = [Number(body.industry)];
  if (body.location) companyFilters.locations = [{ country: body.location }];
  if (body.technologies?.length)
    companyFilters.technologies = body.technologies;
  if (body.company_sizes?.length) {
    companyFilters.sizes = body.company_sizes.map((id: string) => {
      const [min, max] = id.split("-");
      return max
        ? { min: Number(min), max: Number(max) }
        : { min: Number(min) };
    });
  }
  if (body.revenue) {
    const [min, max] = body.revenue.split("-");
    companyFilters.revenues = [
      max ? { min: Number(min), max: Number(max) } : { min: Number(min) },
    ];
  }

  const payload: Record<string, any> = {
    pages: { page: 1, size: Math.max(10, Math.min(body.max_leads || 25, 100)) },
    filters: {
      contacts: { include: contactFilters },
      ...(Object.keys(companyFilters).length > 0 && {
        companies: { include: companyFilters },
      }),
    },
  };

  const res = await fetch(`${LUSHA_API}/prospecting/contact/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", api_key: apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    return json(
      { error: `Lusha search failed (${res.status}): ${text.slice(0, 300)}` },
      502,
    );
  }
  const data = await res.json();
  return json({
    requestId: data.requestId,
    totalResults: data.totalResults,
    prospects: data.data ?? data.contacts ?? [],
  });
}

async function handleEnrich(body: any, apiKey: string): Promise<Response> {
  const { email, firstName, lastName, company, requestId, contactIds } = body;

  // Batch enrich from a previous search result
  if (requestId && contactIds?.length) {
    const res = await fetch(
      `${LUSHA_API}/prospecting/contact/enrich`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", api_key: apiKey },
        body: JSON.stringify({ requestId, contactIds }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return json(
        { error: `Lusha batch enrich failed (${res.status}): ${text.slice(0, 300)}` },
        502,
      );
    }
    const result = await res.json();
    return json({ enriched: true, contacts: result.contacts ?? [] });
  }

  // Single-contact enrich by email/name
  if (!email && !firstName && !lastName)
    return json({ error: "email or firstName+lastName required" }, 400);
  const payload: Record<string, string> = {};
  if (email) payload.email = email;
  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (company) payload.company = company;
  const res = await fetch(`${LUSHA_API}/prospecting/contact/enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json", api_key: apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 404) return json({ enriched: false });
    const text = await res.text();
    return json(
      { error: `Lusha enrich failed (${res.status}): ${text.slice(0, 300)}` },
      502,
    );
  }
  return json({ enriched: true, contact: await res.json() });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}
