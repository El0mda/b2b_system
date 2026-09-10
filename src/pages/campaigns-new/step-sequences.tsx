import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles, Layers, BookmarkPlus, Save } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SequenceStepList } from "@/components/sequence/step-editor";
import { BUILTIN_VERTICALS } from "@/lib/sequence-presets";
import {
  BUILTIN_PREFIX,
  orgVerticalId,
  templateOptions,
  useSequenceLibrary,
  verticalOptions,
} from "@/lib/sequence-library";
import type { WizardState } from "./types";

const DEFAULT_VERTICAL = BUILTIN_PREFIX + BUILTIN_VERTICALS[0].key;

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

  const verticalChoices = useMemo(() => verticalOptions(verticals), [verticals]);
  const verticalKey = state.verticalKey || DEFAULT_VERTICAL;
  const templateChoices = useMemo(
    () => templateOptions(verticalKey, templates),
    [verticalKey, templates],
  );

  // Initialize from the selected template on first mount if no steps exist.
  useEffect(() => {
    if (state.sequenceSteps.length > 0) return;
    const template =
      templateChoices.find((t) => t.key === state.presetKey) ?? templateChoices[0];
    if (!template) return;
    setState((p) => ({
      ...p,
      verticalKey,
      presetKey: template.key,
      sequenceSteps: clone(template.steps),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateChoices.length]);

  // Switching industry switches the sequence with it — the copy is the
  // whole point of the vertical, so leaving the old steps in place would
  // silently send manufacturing wording to a logistics list.
  const applyVertical = (key: string) => {
    const first = templateOptions(key, templates)[0];
    if (
      state.sequenceSteps.length > 0 &&
      !confirm("Switch vertical and replace your current sequence?")
    ) {
      return;
    }
    setState((p) => ({
      ...p,
      verticalKey: key,
      presetKey: first?.key ?? "",
      sequenceSteps: first ? clone(first.steps) : [],
    }));
  };

  const applyTemplate = (key: string) => {
    const template = templateChoices.find((t) => t.key === key);
    if (!template) return;
    if (
      state.sequenceSteps.length > 0 &&
      !confirm("Replace your current sequence with this template?")
    ) {
      return;
    }
    setState((p) => ({ ...p, presetKey: template.key, sequenceSteps: clone(template.steps) }));
    toast.success(`Loaded: ${template.name}`);
  };

  const saveAsTemplate = async (name: string, description: string, verticalId: string) => {
    if (!orgId) return;
    const { error } = await supabase.from("sequence_templates").insert({
      org_id: orgId,
      vertical_id: verticalId,
      created_by: profile?.id ?? null,
      name: name.trim(),
      description: description.trim() || null,
      steps: state.sequenceSteps.map((s, i) => ({ ...s, step: i + 1 })),
    });
    if (error) {
      toast.error(error.message || "Couldn't save the template");
      return;
    }
    qc.invalidateQueries({ queryKey: ["sequence-templates", orgId] });
    setSaveOpen(false);
    toast.success("Saved to your sequence library");
  };

  const totalDelayDays = state.sequenceSteps.reduce((sum, s) => sum + (s.delay_days || 0), 0);
  const canContinue =
    state.sequenceSteps.length > 0 &&
    state.sequenceSteps.every((s) => s.subject.trim() && s.body.trim());

  const selectedVertical = verticalChoices.find((v) => v.key === verticalKey);
  const selectedTemplate = templateChoices.find((t) => t.key === state.presetKey);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Vertical & Sequence</CardTitle>
          </div>
          <CardDescription>
            Pick the industry you're writing to, then a sequence written for it. Manage the library
            on the Sequences page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vertical">
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Vertical
                </span>
              </Label>
              <Select id="vertical" value={verticalKey} onChange={(e) => applyVertical(e.target.value)}>
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
              <Label htmlFor="preset">Sequence</Label>
              <Select
                id="preset"
                value={state.presetKey}
                onChange={(e) => applyTemplate(e.target.value)}
              >
                {templateChoices.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{selectedTemplate?.description ?? ""}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{state.sequenceSteps.length}</strong> steps
            </span>
            <span>·</span>
            <span>
              <strong className="text-foreground">{totalDelayDays}</strong> total days
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={!canContinue}
              onClick={() => setSaveOpen(true)}
            >
              <BookmarkPlus className="h-3.5 w-3.5" /> Save as template
            </Button>
          </div>
        </CardContent>
      </Card>

      <SequenceStepList
        steps={state.sequenceSteps}
        onChange={(steps) => setState((p) => ({ ...p, sequenceSteps: steps }))}
      />

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!canContinue}>
          Review & Launch
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {saveOpen && (
        <SaveTemplateDialog
          verticals={verticals}
          defaultVerticalId={orgVerticalId(verticalKey)}
          defaultName={state.campaignName ? `${state.campaignName} sequence` : ""}
          onClose={() => setSaveOpen(false)}
          onSave={saveAsTemplate}
        />
      )}
    </div>
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
        <DialogTitle>Save as template</DialogTitle>
        <DialogDescription>
          Keeps this sequence in your library so the next campaign in this industry can start from
          it.
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
            <Label htmlFor="save-name">Template name</Label>
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
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save template"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
