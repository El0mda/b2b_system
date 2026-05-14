# lusha-search Edge Function

Server-side proxy for the Lusha Prospecting API. Provides filter options, search, and enrich capabilities.

## Deploy

```bash
supabase functions deploy lusha-search
supabase secrets set LUSHA_API_KEY=api_key_here
```

## Actions

| Action | Method | Description |
|--------|--------|-------------|
| `filter-options` | POST | Fetch available filter values (industries, sizes, revenues, departments, seniorities) |
| `search` | POST | Search prospects using filters |
| `enrich` | POST | Enrich a single contact |
| `autocomplete-companies` | POST | Autocomplete company name |
| `autocomplete-locations` | POST | Autocomplete location |
| `autocomplete-technologies` | POST | Autocomplete technology name |

## Invoke from the app

```ts
const { data } = await supabase.functions.invoke("lusha-search", {
  body: { action: "search", industry: "id", max_leads: 100, ...filters },
});
```
