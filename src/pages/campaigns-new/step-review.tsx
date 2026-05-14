import { ArrowRight, Users, Mail, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WizardState } from "./types";

export function StepReview({
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
  const total = state.leads.length;
  const selected = state.selectedLeadIds.size;
  const validEmails = state.leads.filter(
    (l, i) =>
      state.selectedLeadIds.has(String(i)) &&
      (l.email_valid === null || l.email_valid === undefined || l.email_valid === true),
  ).length;
  const invalid = state.leads.filter(
    (_, i) =>
      state.selectedLeadIds.has(String(i)) &&
      state.leads[i].email_valid === false,
  ).length;

  const toggleAll = (next: boolean) => {
    setState((p) => ({
      ...p,
      selectedLeadIds: next ? new Set(p.leads.map((_, i) => String(i))) : new Set(),
    }));
  };

  const toggleOne = (id: string) => {
    setState((p) => {
      const ns = new Set(p.selectedLeadIds);
      if (ns.has(id)) ns.delete(id);
      else ns.add(id);
      return { ...p, selectedLeadIds: ns };
    });
  };

  const isLusha = state.sourceTab === "lusha";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard icon={Users} label="Total leads" value={total} color="bg-blue-500" />
        <SummaryCard icon={Mail} label="Valid emails" value={validEmails} color="bg-emerald-500" />
        <SummaryCard
          icon={AlertCircle}
          label="Invalid / unverified"
          value={invalid}
          color="bg-amber-500"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review leads ({selected} selected)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.leads.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No leads in this campaign yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected === total && total > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>NB Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.leads.map((l, i) => {
                  const id = String(i);
                  const checked = state.selectedLeadIds.has(id);
                  const nb = l.nb_result ?? null;
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <Checkbox checked={checked} onCheckedChange={() => toggleOne(id)} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {(l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim()) || "—"}
                      </TableCell>
                      <TableCell>{l.email}</TableCell>
                      <TableCell className="text-muted-foreground">{l.company ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{l.job_title ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{l.phone ?? "—"}</TableCell>
                      <TableCell>
                        {nb === null ? (
                          <Badge variant="secondary">Not run</Badge>
                        ) : nb === "valid" || nb === "catchall" ? (
                          <Badge variant="success">{nb}</Badge>
                        ) : nb === "invalid" || nb === "disposable" ? (
                          <Badge className="bg-destructive/10 text-destructive">{nb}</Badge>
                        ) : (
                          <Badge variant="warning">{nb}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={selected === 0}>
          Continue to Sequences
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
