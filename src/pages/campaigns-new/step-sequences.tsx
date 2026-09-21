// The campaign's sequences — one or several, each for an audience.
//
// With one sequence this is the familiar step editor. Add more and each
// gets its own job positions; leads are then routed to the sequence whose
// positions match their title (lib/tracks.ts), with a default for
// everyone else. The routing is shown live, with counts, so nothing is a
// surprise at launch.
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Layers,
  BookmarkPlus,
  Save,
  Plus,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SequenceStepList } from "@/components/sequence/step-editor";
import { JobPositionsInput } from "@/components/sequence/job-positions-input";
import { BUILTIN_VERTICALS, isStepComplete, stepType } from "@/lib/sequence-presets";
import {
  BUILTIN_PREFIX,
  orgKey,
  orgVerticalId,
  templateOptions,
  useSequenceLibrary,
  verticalOptions,
  type TemplateOption,
} from "@/lib/sequence-library";
import { assignLeads, leadKey, newTrackKey, type WizardTrack } from "@/lib/tracks";
import { cn } from "@/lib/utils";
import type { WizardState } from "./types";

const DEFAULT_VERTICAL = BUILTIN_PREFIX + BUILTIN_VERTICALS[0].key;

function trackFromTemplate(t: TemplateOption, verticalKey: string, name?: string): WizardTrack {
  return {
    key: newTrackKey(),
    name: name ?? t.name,
    jobPositions: [...t.jobPositions],
    steps: clone(t.steps),
    verticalKey,
    presetKey: t.key,
    templateId: t.templateId,
  };
}

function blankTrack(n: number): WizardTrack {
  return {
    key: newTrackKey(),
    name: `Sequence ${n}`,
    jobPositions: [],
    steps: [{ step: 1, type: "email", delay_days: 0, subject: "", body: "" }],
    verticalKey: DEFAULT_VERTICAL,
    presetKey: "",
    templateId: null,
  };
}

export function StepSequences({
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
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const { verticals, templates } = useSequenceLibrary(orgId);
  const [saveOpen, setSaveOpen] = useState(false);

  const tracks = state.tracks;
  const active = tracks.find((t) => t.key === state.activeTrackKey) ?? tracks[0] ?? null;

  // First visit: start with one sequence, from the default template, so
  // the single-sequence campaign works exactly as it always has.
  useEffect(() => {
    if (tracks.length > 0) return;
    const first = templateOptions(DEFAULT_VERTICAL, templates)[0];
    const track = first ? trackFromTemplate(first, DEFAULT_VERTICAL, "Main sequence") : blankTrack(1);
    setState((p) => ({
      ...p,
      tracks: [track],
      activeTrackKey: track.key,
      defaultTrackKey: track.key,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateTrack = (key: string, patch: Partial<WizardTrack>) =>
    setState((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    }));

  const addTrack = (track: WizardTrack) =>
    setState((p) => ({
      ...p,
      tracks: [...p.tracks, track],
      activeTrackKey: track.key,
      defaultTrackKey: p.defaultTrackKey ?? p.tracks[0]?.key ?? track.key,
    }));

  const removeTrack = (key: string) =>
    setState((p) => {
      const rest = p.tracks.filter((t) => t.key !== key);
      // Drop overrides that pointed at the removed sequence rather than
      // leaving leads assigned to nothing.
      const overrides = Object.fromEntries(
        Object.entries(p.trackOverrides).filter(([, v]) => v !== key),
      );
      return {
        ...p,
        tracks: rest,
        activeTrackKey: p.activeTrackKey === key ? (rest[0]?.key ?? null) : p.activeTrackKey,
        defaultTrackKey: p.defaultTrackKey === key ? (rest[0]?.key ?? null) : p.defaultTrackKey,
        trackOverrides: overrides,
      };
    });

  const selectedLeads = useMemo(
    () => state.leads.filter((_, i) => state.selectedLeadIds.has(String(i))),
    [state.leads, state.selectedLeadIds],
  );

  const assignment = useMemo(
    () => assignLeads(selectedLeads, tracks, state.defaultTrackKey, state.trackOverrides),
    [selectedLeads, tracks, state.defaultTrackKey, state.trackOverrides],
  );

  // Everything that would make the launch fail or send nonsense.
  const problems: string[] = [];
  for (const t of tracks) {
    const label = `"${t.name || "Untitled"}"`;
    if (!t.name.trim()) problems.push("Every sequence needs a name.");
    if (t.steps.length === 0) problems.push(`${label} has no steps.`);
    else if (!t.steps.every(isStepComplete))
      problems.push(
        `${label} has an unfinished step — emails need a subject and body, calls a title, WhatsApp steps a message.`,
      );
    if (tracks.length > 1 && (assignment.counts.get(t.key) ?? 0) === 0)
      problems.push(
        `No leads go to ${label}. Add job positions that match your leads, move some leads to it, or remove it.`,
      );
  }
  if (selectedLeads.length > 0 && assignment.counts.size > 0) {
    const assigned = [...assignment.counts.values()].reduce((a, b) => a + b, 0);
    if (assigned === 0) problems.push("No leads are going to any sequence.");
  }
  const uniqueProblems = [...new Set(problems)];
  const canContinue = tracks.length > 0 && uniqueProblems.length === 0;

  const saveAsTemplate = async (
    name: string,
    description: string,
    verticalId: string,
  ) => {
    if (!orgId || !active) return;
    const { error } = await supabase.from("sequence_templates").insert({
      org_id: orgId,
      vertical_id: verticalId,
      created_by: profile?.id ?? null,
      name: name.trim(),
      description: description.trim() || null,
      job_positions: active.jobPositions,
      steps: active.steps.map((s, i) => ({ ...s, step: i + 1 })),
    });
    if (error) {
      toast.error(error.message || "Couldn't save the template");
      return;
    }
    qc.invalidateQueries({ queryKey: ["sequence-templates", orgId] });
    setSaveOpen(false);
    toast.success("Saved to your sequence library");
  };

  return (
    <div className="space-y-6">
      <TrackBar
        tracks={tracks}
        activeKey={active?.key ?? null}
        counts={assignment.counts}
        showCounts={tracks.length > 1}
        templates={templates}
        onSelect={(key) => setState((p) => ({ ...p, activeTrackKey: key }))}
        onAdd={addTrack}
      />

      {active && (
        <TrackEditor
          key={active.key}
          track={active}
          canRemove={tracks.length > 1}
          multi={tracks.length > 1}
          templates={templates}
          verticals={verticals}
          onChange={(patch) => updateTrack(active.key, patch)}
          onRemove={() => {
            if (confirm(`Remove "${active.name}" from this campaign?`)) removeTrack(active.key);
          }}
          onSaveTemplate={() => setSaveOpen(true)}
        />
      )}

      {tracks.length > 1 && (
        <AssignmentCard
          tracks={tracks}
          leads={selectedLeads}
          byLead={assignment.byLead}
          counts={assignment.counts}
          unmatched={assignment.unmatched}
          excluded={assignment.excluded}
          defaultKey={state.defaultTrackKey}
          overrides={state.trackOverrides}
          onDefault={(key) => setState((p) => ({ ...p, defaultTrackKey: key }))}
          onOverride={(lead, trackKey) =>
            setState((p) => ({
              ...p,
              trackOverrides: { ...p.trackOverrides, [lead]: trackKey },
            }))
          }
        />
      )}

      {uniqueProblems.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          {uniqueProblems.map((p) => (
            <p key={p} className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p}
            </p>
          ))}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!canContinue}>
          Review & Launch
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {saveOpen && active && (
        <SaveTemplateDialog
          verticals={verticals}
          defaultVerticalId={orgVerticalId(active.verticalKey)}
          defaultName={active.name}
          onClose={() => setSaveOpen(false)}
          onSave={saveAsTemplate}
        />
      )}
    </div>
  );
}

// Tabs across the top: one per sequence, with how many leads it gets.
function TrackBar({
  tracks,
  activeKey,
  counts,
  showCounts,
  templates,
  onSelect,
  onAdd,
}: {
  tracks: WizardTrack[];
  activeKey: string | null;
  counts: Map<string, number>;
  showCounts: boolean;
  templates: Parameters<typeof templateOptions>[1];
  onSelect: (key: string) => void;
  onAdd: (track: WizardTrack) => void;
}) {
  // Saved sequences with job positions first: those are the ones built
  // for this — "one for HR, one for sales".
  const saved = [...templates].sort(
    (a, b) => (b.job_positions?.length ?? 0) - (a.job_positions?.length ?? 0),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <CardTitle>Sequences in this campaign</CardTitle>
        </div>
        <CardDescription>
          Use one sequence for everyone, or add one per audience — each lead gets the sequence
          matching their job title.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {tracks.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(t.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                t.key === activeKey
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              {t.name || "Untitled"}
              {showCounts && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    t.key === activeKey ? "bg-white/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts.get(t.key) ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value=""
            aria-label="Add a sequence"
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v === "__blank__") {
                onAdd(blankTrack(tracks.length + 1));
                return;
              }
              const t = saved.find((x) => x.id === v);
              if (!t) return;
              onAdd({
                key: newTrackKey(),
                name: t.name,
                jobPositions: [...(t.job_positions ?? [])],
                steps: clone(t.steps),
                verticalKey: t.vertical_id ? orgKey(t.vertical_id) : DEFAULT_VERTICAL,
                presetKey: orgKey(t.id),
                templateId: t.id,
              });
            }}
            className="max-w-sm"
          >
            <option value="">＋ Add another sequence…</option>
            {saved.length > 0 && (
              <optgroup label="From your Sequences tab">
                {saved.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.job_positions?.length ? ` — for ${t.job_positions.slice(0, 3).join(", ")}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="__blank__">Blank sequence</option>
          </Select>
          {saved.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Tip: create sequences with job positions in the Sequences tab, then add them here.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TrackEditor({
  track,
  canRemove,
  multi,
  templates,
  verticals,
  onChange,
  onRemove,
  onSaveTemplate,
}: {
  track: WizardTrack;
  canRemove: boolean;
  multi: boolean;
  templates: Parameters<typeof templateOptions>[1];
  verticals: Parameters<typeof verticalOptions>[0];
  onChange: (patch: Partial<WizardTrack>) => void;
  onRemove: () => void;
  onSaveTemplate: () => void;
}) {
  const verticalChoices = useMemo(() => verticalOptions(verticals), [verticals]);
  const templateChoices = useMemo(
    () => templateOptions(track.verticalKey, templates),
    [track.verticalKey, templates],
  );
  const selectedVertical = verticalChoices.find((v) => v.key === track.verticalKey);
  const selectedTemplate = templateChoices.find((t) => t.key === track.presetKey);

  // Loading a template replaces the steps — and fills in the name and job
  // positions too, when the sequence doesn't have its own yet.
  const loadTemplate = (key: string) => {
    const t = templateChoices.find((x) => x.key === key);
    if (!t) return;
    const hasContent = track.steps.some((s) => s.subject.trim() || s.body.trim());
    if (hasContent && !confirm("Replace this sequence's steps with the template?")) return;
    onChange({
      presetKey: t.key,
      templateId: t.templateId,
      steps: clone(t.steps),
      ...(track.jobPositions.length === 0 ? { jobPositions: [...t.jobPositions] } : {}),
      ...(/^(Main sequence|Sequence \d+)$/.test(track.name) ? { name: t.name } : {}),
    });
    toast.success(`Loaded: ${t.name}`);
  };

  const emails = track.steps.filter((s) => stepType(s) === "email").length;
  const calls = track.steps.filter((s) => stepType(s) === "call").length;
  const whatsapps = track.steps.filter((s) => stepType(s) === "whatsapp").length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>{track.name || "Untitled sequence"}</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onSaveTemplate}>
                <BookmarkPlus className="h-3.5 w-3.5" /> Save to library
              </Button>
              {canRemove && (
                <Button variant="ghost" size="sm" onClick={onRemove}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            {emails} email{emails === 1 ? "" : "s"}
            {calls > 0 ? ` · ${calls} call${calls === 1 ? "" : "s"}` : ""}
            {whatsapps > 0 ? ` · ${whatsapps} WhatsApp` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="track-name">Sequence name</Label>
              <Input
                id="track-name"
                value={track.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="HR outreach"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="track-positions">
                Job positions{" "}
                {!multi && <span className="font-normal text-muted-foreground">(optional)</span>}
              </Label>
              <JobPositionsInput
                id="track-positions"
                value={track.jobPositions}
                onChange={(jobPositions) => onChange({ jobPositions })}
              />
              {!multi && (
                <p className="text-xs text-muted-foreground">
                  With one sequence, every lead gets it. Positions matter once you add another.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vertical">Load from library — vertical</Label>
              <Select
                id="vertical"
                value={track.verticalKey}
                onChange={(e) => onChange({ verticalKey: e.target.value, presetKey: "" })}
              >
                {verticalChoices.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.name}
                    {v.builtin ? " (built-in)" : ""}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{selectedVertical?.description ?? ""}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset">Template</Label>
              <Select
                id="preset"
                value={track.presetKey}
                onChange={(e) => loadTemplate(e.target.value)}
              >
                <option value="">Choose a template…</option>
                {templateChoices.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{selectedTemplate?.description ?? ""}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <SequenceStepList
        steps={track.steps}
        idPrefix={`track-${track.key.slice(0, 8)}`}
        onChange={(steps) => onChange({ steps })}
      />
    </>
  );
}

// Who gets which sequence — counts, the fallback, and hand corrections.
function AssignmentCard({
  tracks,
  leads,
  byLead,
  counts,
  unmatched,
  excluded,
  defaultKey,
  overrides,
  onDefault,
  onOverride,
}: {
  tracks: WizardTrack[];
  leads: Array<{ email: string; full_name?: string; first_name?: string; last_name?: string; job_title?: string }>;
  byLead: Map<string, string | null>;
  counts: Map<string, number>;
  unmatched: number;
  excluded: number;
  defaultKey: string | null;
  overrides: Record<string, string>;
  onDefault: (key: string | null) => void;
  onOverride: (lead: string, trackKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const rows = leads.filter((l) => {
    if (filter === "all") return true;
    const k = byLead.get(leadKey(l)) ?? "__none__";
    return k === filter;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle>Who gets which sequence</CardTitle>
        </div>
        <CardDescription>
          Each lead goes to the first sequence whose job positions match their title.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => (
            <div key={t.key} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{t.name || "Untitled"}</p>
                <span className="text-lg font-bold">{counts.get(t.key) ?? 0}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t.jobPositions.length > 0
                  ? t.jobPositions.join(", ")
                  : "No job positions — only default / moved leads"}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm">
            <strong>{unmatched}</strong> lead{unmatched === 1 ? "" : "s"} match no job position.
            Send them:
          </p>
          <Select
            value={defaultKey ?? "__none__"}
            onChange={(e) => onDefault(e.target.value === "__none__" ? null : e.target.value)}
            className="max-w-xs"
            aria-label="Default sequence"
          >
            {tracks.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name || "Untitled"}
              </option>
            ))}
            <option value="__none__">Leave them out of the campaign</option>
          </Select>
          {excluded > 0 && (
            <Badge variant="warning">
              {excluded} left out
            </Badge>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? "Hide leads" : "See and move individual leads"}
        </button>

        {open && (
          <div className="space-y-2">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-xs"
              aria-label="Filter leads by sequence"
            >
              <option value="all">All leads ({leads.length})</option>
              {tracks.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name || "Untitled"} ({counts.get(t.key) ?? 0})
                </option>
              ))}
              {excluded > 0 && <option value="__none__">Left out ({excluded})</option>}
            </Select>
            <div className="max-h-96 overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Lead</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Job title</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Sequence</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((l) => {
                    const k = leadKey(l);
                    const current = byLead.get(k) ?? null;
                    const name =
                      l.full_name || `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || l.email;
                    return (
                      <tr key={k} className="border-t border-border">
                        <td className="px-3 py-1.5">
                          <p className="truncate font-medium">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">{l.email}</p>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{l.job_title || "—"}</td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={current ?? ""}
                            onChange={(e) => onOverride(k, e.target.value)}
                            aria-label={`Sequence for ${name}`}
                            className={cn(overrides[k] && "border-primary")}
                          >
                            {current === null && <option value="">Left out</option>}
                            {tracks.map((t) => (
                              <option key={t.key} value={t.key}>
                                {t.name || "Untitled"}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 500 && (
              <p className="text-xs text-muted-foreground">
                Showing the first 500 — filter by sequence to see the rest.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// A template has to live in a vertical the org owns — the built-in ones
// ship with the app and can't take new entries.
function SaveTemplateDialog({
  verticals,
  defaultVerticalId,
  defaultName,
  onClose,
  onSave,
}: {
  verticals: Array<{ id: string; name: string }>;
  defaultVerticalId: string | null;
  defaultName: string;
  onClose: () => void;
  onSave: (name: string, description: string, verticalId: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [verticalId, setVerticalId] = useState(defaultVerticalId ?? verticals[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Save to library</DialogTitle>
        <DialogDescription>
          Keeps this sequence — steps and job positions — so future campaigns can reuse it.
        </DialogDescription>
      </DialogHeader>
      {verticals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don't have any verticals of your own yet — create one on the Sequences page first,
          then save into it.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="save-vertical">Vertical</Label>
            <Select
              id="save-vertical"
              value={verticalId}
              onChange={(e) => setVerticalId(e.target.value)}
            >
              {verticals.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="save-name">Name</Label>
            <Input id="save-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="save-description">Description (optional)</Label>
            <Input
              id="save-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || !verticalId || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(name, description, verticalId);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
