// The org's own sequence library: industry verticals and the templates
// inside them. Built-in verticals/presets live in sequence-presets.ts;
// everything a user creates lives in Supabase, and both are merged into
// one picker so the campaign wizard doesn't care which is which.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import {
  ANY_VERTICAL,
  BUILTIN_VERTICALS,
  presetsForVertical,
  type SequenceStep,
} from "@/lib/sequence-presets";

export interface OrgVertical {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface OrgTemplate {
  id: string;
  vertical_id: string | null;
  name: string;
  description: string | null;
  steps: SequenceStep[];
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Keys are namespaced so a user-created vertical can never collide with
// a built-in one, and so the wizard can round-trip its selection into a
// plain string field.
export const BUILTIN_PREFIX = "builtin:";
export const ORG_PREFIX = "org:";

// Namespaces a row id (a vertical's or a template's) into a picker key.
export function orgKey(id: string): string {
  return ORG_PREFIX + id;
}

export function isOrgVerticalKey(key: string): boolean {
  return key.startsWith(ORG_PREFIX);
}

export function orgVerticalId(key: string): string | null {
  return isOrgVerticalKey(key) ? key.slice(ORG_PREFIX.length) : null;
}

export interface VerticalOption {
  key: string;
  name: string;
  description: string;
  builtin: boolean;
}

export interface TemplateOption {
  key: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  builtin: boolean;
}

export function verticalOptions(orgVerticals: OrgVertical[]): VerticalOption[] {
  return [
    ...BUILTIN_VERTICALS.map((v) => ({
      key: BUILTIN_PREFIX + v.key,
      name: v.name,
      description: v.description,
      builtin: true,
    })),
    ...orgVerticals.map((v) => ({
      key: orgKey(v.id),
      name: v.name,
      description: v.description ?? "",
      builtin: false,
    })),
  ];
}

// Templates offered inside a vertical: the built-in presets tagged with
// it (a built-in vertical only) plus every saved template filed under
// it. The blank "Custom" preset is tagged ANY_VERTICAL, so it comes back
// for every built-in vertical; org verticals get it appended here.
export function templateOptions(
  verticalKey: string,
  orgTemplates: OrgTemplate[],
): TemplateOption[] {
  // An org vertical has no built-in presets of its own, so it still
  // gets the industry-agnostic ones (i.e. the blank starting point).
  const builtinKey = verticalKey.startsWith(BUILTIN_PREFIX)
    ? verticalKey.slice(BUILTIN_PREFIX.length)
    : ANY_VERTICAL;
  const builtins = presetsForVertical(builtinKey).map((p) => ({
    key: BUILTIN_PREFIX + p.key,
    name: p.name,
    description: p.description,
    steps: p.steps,
    builtin: true,
  }));

  const id = orgVerticalId(verticalKey);
  const saved = orgTemplates
    .filter((t) => (id ? t.vertical_id === id : false))
    .map((t) => ({
      key: orgKey(t.id),
      name: t.name,
      description: t.description ?? `${t.steps.length} steps`,
      steps: t.steps,
      builtin: false,
    }));

  return [...saved, ...builtins];
}

// Steps arrive from Supabase as jsonb — anything could be in the column,
// so it's normalized here rather than at every call site.
export function parseSteps(value: unknown): SequenceStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, i) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      return {
        step: typeof s.step === "number" ? s.step : i + 1,
        delay_days: typeof s.delay_days === "number" ? s.delay_days : 0,
        subject: typeof s.subject === "string" ? s.subject : "",
        body: typeof s.body === "string" ? s.body : "",
      };
    })
    .sort((a, b) => a.step - b.step);
}

export function useSequenceLibrary(orgId: string | undefined) {
  const verticals = useQuery<OrgVertical[]>({
    queryKey: ["sequence-verticals", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sequence_verticals")
        .select("id, name, description, created_by, created_at")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as OrgVertical[];
    },
  });

  const templates = useQuery<OrgTemplate[]>({
    queryKey: ["sequence-templates", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sequence_templates")
        .select("id, vertical_id, name, description, steps, created_by, created_at, updated_at")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, steps: parseSteps(t.steps) })) as OrgTemplate[];
    },
  });

  return {
    verticals: verticals.data ?? [],
    templates: templates.data ?? [],
    isLoading: verticals.isLoading || templates.isLoading,
  };
}
