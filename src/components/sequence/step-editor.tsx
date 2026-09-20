// The sequence step editor, shared by the campaign wizard and the
// Sequences library page — both edit the exact same shape, and a
// template that behaved differently from the campaign it seeds would be
// a trap.
import { useRef, useState } from "react";
import { Plus, Trash2, Mail, PhoneCall, ImagePlus, Film, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PERSONALIZATION_TOKENS } from "@/lib/template";
import { useAuth } from "@/hooks/use-auth";
import {
  IMAGE_TYPES,
  VIDEO_TYPES,
  formatBytes,
  uploadEmailMedia,
  validateMediaFile,
  type EmailMedia,
} from "@/lib/email-media";
import { describeDelay, stepType, type SequenceStep } from "@/lib/sequence-presets";

export function SequenceStepList({
  steps,
  onChange,
  idPrefix = "step",
}: {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
  idPrefix?: string;
}) {
  const updateStep = (idx: number, patch: Partial<SequenceStep>) =>
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  // Step numbers are positional, so removing one renumbers the rest.
  const removeStep = (idx: number) =>
    onChange(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step: i + 1 })));

  const addStep = (type: "email" | "call") =>
    onChange([
      ...steps,
      type === "call"
        ? {
            step: steps.length + 1,
            type: "call",
            // Hours, not days: a call step is nearly always a same-day
            // follow-up to the email before it.
            delay_days: 0,
            delay_hours: 6,
            subject: "",
            body: "",
            title: "Call the lead",
            notes: "",
          }
        : { step: steps.length + 1, type: "email", delay_days: 3, subject: "", body: "" },
    ]);

  return (
    <div className="space-y-4">
      {steps.map((step, idx) => (
        <SequenceStepCard
          key={idx}
          step={step}
          index={idx}
          idPrefix={idPrefix}
          isFirst={idx === 0}
          onChange={(patch) => updateStep(idx, patch)}
          onRemove={() => removeStep(idx)}
          canRemove={steps.length > 1}
        />
      ))}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={() => addStep("email")}>
          <Plus className="h-4 w-4" />
          <Mail className="h-4 w-4" />
          Add email step
        </Button>
        <Button variant="outline" onClick={() => addStep("call")}>
          <Plus className="h-4 w-4" />
          <PhoneCall className="h-4 w-4" />
          Add call step
        </Button>
      </div>
    </div>
  );
}

function SequenceStepCard({
  step,
  index,
  idPrefix,
  isFirst,
  onChange,
  onRemove,
  canRemove,
}: {
  step: SequenceStep;
  index: number;
  idPrefix: string;
  isFirst: boolean;
  onChange: (patch: Partial<SequenceStep>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const insertToken = (field: "subject" | "body" | "title" | "notes", token: string) => {
    const current = step[field] ?? "";
    onChange({ [field]: `${current}{{${token}}}` } as Partial<SequenceStep>);
  };

  const kind = stepType(step);

  return (
    <Card className={kind === "call" ? "border-amber-500/40" : undefined}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="info">Step {index + 1}</Badge>
            {kind === "call" ? (
              <Badge variant="warning">
                <PhoneCall className="h-3 w-3" /> Call
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Mail className="h-3 w-3" /> Email
              </Badge>
            )}
            {(step.delay_days || 0) + (step.delay_hours || 0) === 0 ? (
              <Badge variant="success">
                {kind === "call" ? "Due at launch" : "Sent immediately"}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">
                +{describeDelay(step)} {isFirst ? "after launch" : "after previous"}
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

        {/* Step 1 email goes out at launch, so it has no delay to set —
            but a call placed first is scheduled off the launch time and
            does. */}
        {(!isFirst || kind === "call") && (
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-delay-${index}`}>
                Days after {isFirst ? "launch" : "previous"}
              </Label>
              <Input
                id={`${idPrefix}-delay-${index}`}
                type="number"
                min={0}
                value={step.delay_days}
                onChange={(e) => onChange({ delay_days: Number(e.target.value) || 0 })}
                className="max-w-[140px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-delay-hours-${index}`}>Hours</Label>
              <Input
                id={`${idPrefix}-delay-hours-${index}`}
                type="number"
                min={0}
                max={23}
                value={step.delay_hours ?? 0}
                onChange={(e) => onChange({ delay_hours: Number(e.target.value) || 0 })}
                className="max-w-[140px]"
              />
            </div>
          </div>
        )}

        {kind === "call" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-title-${index}`}>Task title</Label>
              <Input
                id={`${idPrefix}-title-${index}`}
                value={step.title ?? ""}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Call {{first_name}} at {{company}}"
              />
              <ChipRow onInsert={(t) => insertToken("title", t)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-notes-${index}`}>Call script / notes (optional)</Label>
              <textarea
                id={`${idPrefix}-notes-${index}`}
                value={step.notes ?? ""}
                onChange={(e) => onChange({ notes: e.target.value })}
                placeholder="Reference the email about {{company}}'s downtime, ask who owns the line…"
                rows={5}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
              <ChipRow onInsert={(t) => insertToken("notes", t)} />
            </div>

            <p className="text-xs text-muted-foreground">
              Every lead in the campaign gets a call reminder at this point in the cadence. It
              shows up in your notifications and keeps nagging until you mark it done.
            </p>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-subject-${index}`}>Subject</Label>
              <Input
                id={`${idPrefix}-subject-${index}`}
                value={step.subject}
                onChange={(e) => onChange({ subject: e.target.value })}
                placeholder="e.g. {{first_name}}, quick question about {{company}}"
              />
              <ChipRow onInsert={(t) => insertToken("subject", t)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-body-${index}`}>Body</Label>
              <textarea
                id={`${idPrefix}-body-${index}`}
                value={step.body}
                onChange={(e) => onChange({ body: e.target.value })}
                placeholder="Hi {{first_name}},&#10;&#10;…"
                rows={8}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
              <ChipRow onInsert={(t) => insertToken("body", t)} />
            </div>

            <MediaPicker
              media={step.attachments ?? []}
              onChange={(attachments) => onChange({ attachments })}
            />
          </>
        )}
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

// Photos and videos for an email step. They're uploaded straight away
// (to the public email-media bucket) and embedded below the body when
// the email goes out — SmartLead has no attachment support, so hosted
// media is the only way to get them into the message.
function MediaPicker({
  media,
  onChange,
}: {
  media: EmailMedia[];
  onChange: (media: EmailMedia[]) => void;
}) {
  const { organization } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !organization?.id) return;
    const picked = Array.from(files);

    // Reject bad files up front, before anything starts uploading.
    const valid = picked.filter((file) => {
      const problem = validateMediaFile(file);
      if (problem) toast.error(problem);
      return !problem;
    });
    if (valid.length === 0) return;

    setUploading((u) => [...u, ...valid.map((f) => f.name)]);
    const added: EmailMedia[] = [];
    for (const file of valid) {
      try {
        const uploaded = await uploadEmailMedia(organization.id, file);
        added.push(uploaded);
        if (uploaded.kind === "video" && !uploaded.poster_url) {
          toast.warning(`${file.name}: no thumbnail — the email will show a "Watch the video" link.`);
        }
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message || "upload failed"}`);
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name));
      }
    }
    // Appended in one go so concurrent uploads can't overwrite each other.
    if (added.length > 0) onChange([...media, ...added]);
  };

  const remove = (index: number) => onChange(media.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Photos &amp; videos (optional)</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading.length > 0}
          onClick={() => inputRef.current?.click()}
        >
          {uploading.length > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {uploading.length > 0 ? `Uploading ${uploading.length}…` : "Add photo or video"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset so picking the same file again still fires onChange.
            e.target.value = "";
          }}
        />
      </div>

      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {media.map((m, i) => (
            <div
              key={`${m.url}-${i}`}
              className="group relative overflow-hidden rounded-md border border-border bg-muted/30"
            >
              <img
                src={m.kind === "video" ? (m.poster_url ?? "") : m.url}
                alt={m.name}
                className="aspect-video w-full object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
              />
              {m.kind === "video" && !m.poster_url && (
                <Film className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground">
                {m.kind === "video" ? <Film className="h-3 w-3 shrink-0" /> : null}
                <span className="truncate">{m.name}</span>
                <span className="ml-auto shrink-0">{formatBytes(m.size)}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${m.name}`}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Shown below the email text. Photos appear inline; videos appear as a thumbnail that opens
        the video. Photos up to {formatBytes(5 * 1024 * 1024)}, videos up to{" "}
        {formatBytes(50 * 1024 * 1024)}.
      </p>
    </div>
  );
}
