import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Stepper } from "./stepper";
import { StepConfigure } from "./step-configure";
import { StepSource } from "./step-source";
import { StepReview } from "./step-review";
import { StepSequences } from "./step-sequences";
import { StepLaunch } from "./step-launch";
import { DEFAULT_SEND_SETTINGS } from "@/lib/campaign-settings";
import { DEFAULT_LUSHA_FILTERS } from "@/lib/lusha";
import { emailableIds } from "@/lib/leads";
import { type WizardLead, type WizardState, type WizardStepKey } from "./types";

const INITIAL_STATE: WizardState = {
  campaignName: "",
  senderAccountId: null,
  sender_email: "",
  sender_name: "",
  reply_to_email: "",
  timezone: "UTC",
  sourceTab: "import",
  leads: [],
  selectedLeadIds: new Set(),
  tracks: [],
  activeTrackKey: null,
  defaultTrackKey: null,
  trackOverrides: {},
  campaignId: null,
  sendSettings: DEFAULT_SEND_SETTINGS,
  lushaFilters: DEFAULT_LUSHA_FILTERS,
};

export default function NewCampaignPage() {
  // The Leads page can start a campaign from leads already saved (with
  // no campaign of their own). They arrive as row ids in the navigation
  // state; there's nothing left to search for, so the Search/Import step
  // is skipped and the wizard opens on those leads.
  const location = useLocation();
  const preselectedIds: string[] = Array.isArray(
    (location.state as { leadIds?: unknown } | null)?.leadIds,
  )
    ? ((location.state as { leadIds: string[] }).leadIds)
    : [];
  const fromSavedLeads = preselectedIds.length > 0;

  const [step, setStep] = useState<WizardStepKey>("configure");
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [loadingSaved, setLoadingSaved] = useState(fromSavedLeads);

  const update = (updater: (prev: WizardState) => WizardState) => setState(updater);

  useEffect(() => {
    if (!fromSavedLeads) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, contact_id, email, first_name, last_name, full_name, company, job_title, department, phone, location, linkedin_url, website, nb_result, email_valid, source",
        )
        .in("id", preselectedIds);
      if (cancelled) return;
      if (error) {
        toast.error(`Couldn't load those leads: ${error.message}`);
        setLoadingSaved(false);
        return;
      }
      const leads: WizardLead[] = (data ?? []).map((l) => ({
        // lead_id marks a lead that already has a row: the launch
        // attaches it to the campaign instead of inserting a copy.
        lead_id: l.id,
        id: l.contact_id ?? undefined,
        email: l.email ?? "",
        first_name: l.first_name ?? undefined,
        last_name: l.last_name ?? undefined,
        full_name: l.full_name ?? undefined,
        company: l.company ?? undefined,
        job_title: l.job_title ?? undefined,
        department: l.department ?? undefined,
        phone: l.phone ?? undefined,
        location: l.location ?? undefined,
        linkedin_url: l.linkedin_url ?? undefined,
        website: l.website ?? undefined,
        nb_result: l.nb_result,
        email_valid: l.email_valid,
        has_work_email: !!l.email,
        has_phones: !!l.phone,
      }));
      setState((p) => ({
        ...p,
        leads,
        selectedLeadIds: emailableIds(leads),
      }));
      setLoadingSaved(false);
      if (leads.length < preselectedIds.length) {
        toast.info(
          `${preselectedIds.length - leads.length} of the selected leads are no longer available`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once: the ids come from the navigation that opened this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadingSaved) return <FullPageSpinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">New Campaign</h2>
        <p className="text-sm text-muted-foreground">
          {fromSavedLeads
            ? `Launching to ${state.leads.length} lead${state.leads.length === 1 ? "" : "s"} you already saved.`
            : "Set up your outbound campaign in five steps."}
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <Stepper current={step} skip={fromSavedLeads ? ["source"] : []} />
        </CardContent>
      </Card>

      {step === "configure" && (
        <StepConfigure
          state={state}
          setState={update}
          onNext={() => setStep(fromSavedLeads ? "review" : "source")}
        />
      )}
      {step === "source" && (
        <StepSource
          state={state}
          setState={update}
          onNext={() => setStep("review")}
          onBack={() => setStep("configure")}
        />
      )}
      {step === "review" && (
        <StepReview
          state={state}
          setState={update}
          onNext={() => setStep("sequences")}
          onBack={() => setStep(fromSavedLeads ? "configure" : "source")}
        />
      )}
      {step === "sequences" && (
        <StepSequences
          state={state}
          setState={update}
          onNext={() => setStep("launch")}
          onBack={() => setStep("review")}
        />
      )}
      {step === "launch" && (
        <StepLaunch state={state} setState={update} onBack={() => setStep("sequences")} />
      )}
    </div>
  );
}
