// The sequence library: industry verticals and the email sequences
// written for each of them. A campaign picks a vertical first and a
// sequence second, so the same workspace can run manufacturing copy and
// logistics copy without either one drifting into the other.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Lock,
  Save,
  X,
  Mail,
  PhoneCall,
  ArrowLeft,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FullPageSpinner } from "@/components/ui/spinner";
import { SequenceStepList } from "@/components/sequence/step-editor";
import { isStepComplete, stepType, totalDays, type SequenceStep } from "@/lib/sequence-presets";
import {
  templateOptions,
  useSequenceLibrary,
  verticalOptions,
  orgKey,
  orgVerticalId,
  type OrgTemplate,
  type OrgVertical,
} from "@/lib/sequence-library";
import { cn } from "@/lib/utils";

interface TemplateDraft {
  id: string | null;
  verticalId: string;
  name: string;
  description: string;
  steps: SequenceStep[];
}

export default function SequencesPage() {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const canManageAny = profile?.role === "owner" || profile?.role === "admin";

  const { verticals, templates, isLoading } = useSequenceLibrary(orgId);
  const options = useMemo(() => verticalOptions(verticals), [verticals]);

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [verticalDialog, setVerticalDialog] = useState<OrgVertical | "new" | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);

  // Default to the first vertical, and follow along if the selected one
  // is deleted underneath us.
  useEffect(() => {
    if (options.length === 0) return;
    if (!options.some((o) => o.key === selectedKey)) setSelectedKey(options[0].key);
  }, [options, selectedKey]);

  const selected = options.find((o) => o.key === selectedKey) ?? null;
  const selectedVerticalId = selected ? orgVerticalId(selected.key) : null;
  const visibleTemplates = useMemo(
    () => (selected ? templateOptions(selected.key, templates) : []),
    [selected, templates],
  );

  const canEdit = (createdBy: string | null) =>
    canManageAny || (!!profile?.id && createdBy === profile.id);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sequence-verticals", orgId] });
    qc.invalidateQueries({ queryKey: ["sequence-templates", orgId] });
  };

  const saveVertical = useMutation({
    mutationFn: async (input: { id: string | null; name: string; description: string }) => {
      if (!orgId) throw new Error("No workspace");
      if (input.id) {
        const { error } = await supabase
          .from("sequence_verticals")
          .update({
            name: input.name.trim(),
            description: input.description.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("sequence_verticals")
        .insert({
          org_id: orgId,
          created_by: profile?.id ?? null,
          name: input.name.trim(),
          description: input.description.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id, input) => {
      invalidate();
      setVerticalDialog(null);
      if (!input.id) setSelectedKey(orgKey(id));
      toast.success(input.id ? "Vertical updated" : "Vertical created");
    },
    onError: (e: any) =>
      toast.error(
        e?.code === "23505" ? "A vertical with that name already exists" : e?.message || "Failed",
      ),
  });

  const deleteVertical = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sequence_verticals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Vertical deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete vertical"),
  });

  const saveTemplate = useMutation({
    mutationFn: async (d: TemplateDraft) => {
      if (!orgId) throw new Error("No workspace");
      const payload = {
        name: d.name.trim(),
        description: d.description.trim() || null,
        // The step editor renumbers on add/remove, but a draft that came
        // from a built-in preset carries the preset's numbering.
        steps: d.steps.map((s, i) => ({ ...s, step: i + 1 })),
        updated_at: new Date().toISOString(),
      };
      if (d.id) {
        const { error } = await supabase
          .from("sequence_templates")
          .update(payload)
          .eq("id", d.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("sequence_templates").insert({
        ...payload,
        org_id: orgId,
        vertical_id: d.verticalId,
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, d) => {
      invalidate();
      setDraft(null);
      toast.success(d.id ? "Sequence updated" : "Sequence saved");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save sequence"),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sequence_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Sequence deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete sequence"),
  });

  if (isLoading) return <FullPageSpinner />;

  // Editing takes over the page — a sequence is long enough that a
  // side-by-side layout would leave no room for the copy itself.
  if (draft) {
    return (
      <TemplateEditor
        draft={draft}
        verticalName={
          options.find((o) => orgVerticalId(o.key) === draft.verticalId)?.name ?? "vertical"
        }
        saving={saveTemplate.isPending}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={() => saveTemplate.mutate(draft)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Sequences</h2>
          <p className="text-sm text-muted-foreground">
            Email sequences grouped by industry. Campaigns start from one of these.
          </p>
        </div>
        <Button onClick={() => setVerticalDialog("new")}>
          <Plus className="h-4 w-4" /> New vertical
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Verticals */}
        <div className="space-y-2">
          {options.map((o) => {
            const org = verticals.find((v) => orgKey(v.id) === o.key);
            const active = o.key === selectedKey;
            return (
              <div
                key={o.key}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedKey(o.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedKey(o.key);
                  }
                }}
                className={cn(
                  "w-full cursor-pointer rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <Layers
                    className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")}
                  />
                  <span className="truncate text-sm font-medium">{o.name}</span>
                  {o.builtin && (
                    <Badge variant="secondary" className="ml-auto">
                      <Lock className="h-3 w-3" /> Built-in
                    </Badge>
                  )}
                </div>
                {o.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.description}</p>
                )}
                {org && canEdit(org.created_by) && (
                  <div className="mt-2 flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVerticalDialog(org);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          confirm(
                            `Delete "${org.name}" and every sequence saved under it? This can't be undone.`,
                          )
                        ) {
                          deleteVertical.mutate(org.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sequences in the selected vertical */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{selected?.name ?? "—"}</h3>
              <p className="text-sm text-muted-foreground">
                {visibleTemplates.length} sequence{visibleTemplates.length === 1 ? "" : "s"}
              </p>
            </div>
            {selectedVerticalId && (
              <Button
                variant="outline"
                onClick={() =>
                  setDraft({
                    id: null,
                    verticalId: selectedVerticalId,
                    name: "",
                    description: "",
                    steps: [{ step: 1, delay_days: 0, subject: "", body: "" }],
                  })
                }
              >
                <Plus className="h-4 w-4" /> New sequence
              </Button>
            )}
          </div>

          {selected?.builtin && (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              Built-in sequences can't be edited directly — copy one into a vertical of your own to
              customize it.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {visibleTemplates.map((t) => {
              const saved: OrgTemplate | undefined = t.builtin
                ? undefined
                : templates.find((x) => orgKey(x.id) === t.key);
              const editable = saved ? canEdit(saved.created_by) : false;
              return (
                <Card key={t.key}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      </div>
                      {t.builtin && (
                        <Badge variant="secondary">
                          <Lock className="h-3 w-3" /> Built-in
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {t.steps.filter((s) => stepType(s) === "email").length} emails
                      </span>
                      {t.steps.some((s) => stepType(s) === "call") && (
                        <span className="flex items-center gap-1">
                          <PhoneCall className="h-3.5 w-3.5" />
                          {t.steps.filter((s) => stepType(s) === "call").length} calls
                        </span>
                      )}
                      <span>{totalDays(t.steps)} days</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {saved && editable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDraft({
                              id: saved.id,
                              verticalId: saved.vertical_id ?? selectedVerticalId ?? "",
                              name: saved.name,
                              description: saved.description ?? "",
                              steps: saved.steps.length
                                ? saved.steps
                                : [{ step: 1, delay_days: 0, subject: "", body: "" }],
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      <CopyToVerticalButton
                        verticals={verticals}
                        onCopy={(verticalId) =>
                          setDraft({
                            id: null,
                            verticalId,
                            name: `${t.name} (copy)`,
                            description: t.description,
                            steps: t.steps.map((s, i) => ({ ...s, step: i + 1 })),
                          })
                        }
                      />
                      {saved && editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete "${saved.name}"?`)) deleteTemplate.mutate(saved.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {visibleTemplates.length === 0 && (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                No sequences in this vertical yet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {verticalDialog && (
        <VerticalDialog
          vertical={verticalDialog === "new" ? null : verticalDialog}
          saving={saveVertical.isPending}
          onClose={() => setVerticalDialog(null)}
          onSave={(name, description) =>
            saveVertical.mutate({
              id: verticalDialog === "new" ? null : verticalDialog.id,
              name,
              description,
            })
          }
        />
      )}
    </div>
  );
}

// Copying is how a built-in sequence becomes editable, and how a
// sequence moves between industries — both need a target vertical, and
// only user-created verticals can hold one.
function CopyToVerticalButton({
  verticals,
  onCopy,
}: {
  verticals: OrgVertical[];
  onCopy: (verticalId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (verticals.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => toast.info("Create a vertical of your own first, then copy into it.")}
      >
        <Copy className="h-3.5 w-3.5" /> Copy
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="h-3.5 w-3.5" /> Copy
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Copy into which vertical?</DialogTitle>
          <DialogDescription>
            You'll get an editable copy — the original stays where it is.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {verticals.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onCopy(v.id);
              }}
              className="w-full rounded-lg border border-border p-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent"
            >
              {v.name}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function VerticalDialog({
  vertical,
  saving,
  onClose,
  onSave,
}: {
  vertical: OrgVertical | null;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(vertical?.name ?? "");
  const [description, setDescription] = useState(vertical?.description ?? "");

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{vertical ? "Edit vertical" : "New vertical"}</DialogTitle>
        <DialogDescription>
          An industry to group sequences under — "Logistics", "Healthcare", "Food & Beverage".
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vertical-name">Name</Label>
          <Input
            id="vertical-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Logistics"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vertical-description">Description (optional)</Label>
          <Input
            id="vertical-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Freight and 3PL operators — capacity and transit-time angles."
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!name.trim() || saving} onClick={() => onSave(name, description)}>
          <Save className="h-4 w-4" /> {vertical ? "Save changes" : "Create vertical"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function TemplateEditor({
  draft,
  verticalName,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: TemplateDraft;
  verticalName: string;
  saving: boolean;
  onChange: (d: TemplateDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const complete =
    draft.name.trim().length > 0 && draft.steps.length > 0 && draft.steps.every(isStepComplete);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{draft.id ? "Edit sequence" : "New sequence"}</h2>
            <p className="text-sm text-muted-foreground">In {verticalName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button disabled={!complete || saving} onClick={onSave}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save sequence"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {draft.steps.length} steps · {totalDays(draft.steps)} days end to end
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Sequence name</Label>
            <Input
              id="template-name"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="Capacity crunch opener"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Input
              id="template-description"
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder="4 steps, 10 days — leads with peak-season capacity."
            />
          </div>
        </CardContent>
      </Card>

      <SequenceStepList
        steps={draft.steps}
        idPrefix="template"
        onChange={(steps) => onChange({ ...draft, steps })}
      />

      {!complete && (
        <p className="text-sm text-muted-foreground">
          Give the sequence a name, fill in a subject and body for every email step, and a title
          for every call step.
        </p>
      )}
    </div>
  );
}
