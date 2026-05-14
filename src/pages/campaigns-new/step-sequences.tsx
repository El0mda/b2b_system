import { useEffect } from "react";
import { Plus, Trash2, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SEQUENCE_PRESETS, type SequenceStep } from "@/lib/sequence-presets";
import { PERSONALIZATION_TOKENS } from "@/lib/template";
import type { WizardState } from "./types";

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
  // Initialize from preset on first mount if no steps exist.
  useEffect(() => {
    if (state.sequenceSteps.length === 0) {
      const preset = SEQUENCE_PRESETS.find((p) => p.key === state.presetKey) ?? SEQUENCE_PRESETS[0];
      setState((p) => ({
        ...p,
        presetKey: preset.key,
        sequenceSteps: clone(preset.steps),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (key: string) => {
    const preset = SEQUENCE_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    if (
      state.sequenceSteps.length > 0 &&
      !confirm("Replace your current sequence with this preset?")
    ) {
      return;
    }
    setState((p) => ({ ...p, presetKey: preset.key, sequenceSteps: clone(preset.steps) }));
    toast.success(`Loaded preset: ${preset.name}`);
  };

  const updateStep = (idx: number, patch: Partial<SequenceStep>) => {
    setState((p) => {
      const steps = p.sequenceSteps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      return { ...p, sequenceSteps: steps };
    });
  };

  const removeStep = (idx: number) => {
    setState((p) => {
      const steps = p.sequenceSteps
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, step: i + 1 }));
      return { ...p, sequenceSteps: steps };
    });
  };

  const addStep = () => {
    setState((p) => ({
      ...p,
      sequenceSteps: [
        ...p.sequenceSteps,
        {
          step: p.sequenceSteps.length + 1,
          delay_days: 3,
          subject: "",
          body: "",
        },
      ],
    }));
  };

  const totalDays = state.sequenceSteps.reduce((sum, s) => sum + (s.delay_days || 0), 0);
  const canContinue =
    state.sequenceSteps.length > 0 &&
    state.sequenceSteps.every((s) => s.subject.trim() && s.body.trim());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Sequence Presets</CardTitle>
          </div>
          <CardDescription>
            Start from one of our manufacturing outbound templates, or build from scratch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="preset">Preset</Label>
            <Select
              id="preset"
              value={state.presetKey}
              onChange={(e) => applyPreset(e.target.value)}
            >
              {SEQUENCE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} {p.totalDays > 0 ? `— ${p.steps.length} steps, ${p.totalDays} days` : ""}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              {SEQUENCE_PRESETS.find((p) => p.key === state.presetKey)?.description ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{state.sequenceSteps.length}</strong> steps
            </span>
            <span>·</span>
            <span>
              <strong className="text-foreground">{totalDays}</strong> total days
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {state.sequenceSteps.map((step, idx) => (
          <SequenceStepCard
            key={idx}
            step={step}
            index={idx}
            isFirst={idx === 0}
            onChange={(patch) => updateStep(idx, patch)}
            onRemove={() => removeStep(idx)}
            canRemove={state.sequenceSteps.length > 1}
          />
        ))}

        <Button variant="outline" onClick={addStep} className="w-full">
          <Plus className="h-4 w-4" />
          Add sequence step
        </Button>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!canContinue}>
          Review & Launch
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SequenceStepCard({
  step,
  index,
  isFirst,
  onChange,
  onRemove,
  canRemove,
}: {
  step: SequenceStep;
  index: number;
  isFirst: boolean;
  onChange: (patch: Partial<SequenceStep>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const insertToken = (field: "subject" | "body", token: string) => {
    const current = step[field];
    onChange({ [field]: `${current}{{${token}}}` } as Partial<SequenceStep>);
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="info">Step {index + 1}</Badge>
            {isFirst ? (
              <Badge variant="success">Sent immediately</Badge>
            ) : (
              <span className="text-sm text-muted-foreground">
                +{step.delay_days} {step.delay_days === 1 ? "day" : "days"} after previous
              </span>
            )}
          </div>
          {canRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>

        {!isFirst && (
          <div className="space-y-1.5">
            <Label htmlFor={`delay-${index}`}>Delay (days from previous step)</Label>
            <Input
              id={`delay-${index}`}
              type="number"
              min={0}
              value={step.delay_days}
              onChange={(e) => onChange({ delay_days: Number(e.target.value) || 0 })}
              className="max-w-[140px]"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`subject-${index}`}>Subject</Label>
          <Input
            id={`subject-${index}`}
            value={step.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="e.g. {{first_name}}, quick question about {{company}}"
          />
          <ChipRow onInsert={(t) => insertToken("subject", t)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`body-${index}`}>Body</Label>
          <textarea
            id={`body-${index}`}
            value={step.body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder="Hi {{first_name}},&#10;&#10;…"
            rows={8}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
          <ChipRow onInsert={(t) => insertToken("body", t)} />
        </div>
      </CardContent>
    </Card>
  );
}

function ChipRow({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERSONALIZATION_TOKENS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onInsert(t)}
          className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-white"
        >
          {"{{"}
          {t}
          {"}}"}
        </button>
      ))}
    </div>
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
