import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper } from "./stepper";
import { StepConfigure } from "./step-configure";
import { StepSource } from "./step-source";
import { StepReview } from "./step-review";
import { StepSequences } from "./step-sequences";
import { StepLaunch } from "./step-launch";
import { type WizardState, type WizardStepKey } from "./types";

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
  sequenceSteps: [],
  presetKey: "pain-point",
  campaignId: null,
  lushaFilters: {
    company_name: "",
    industry: "",
    company_sizes: [],
    location: "",
    revenue: "",
    technologies: [],
    job_titles: [],
    departments: [],
    seniorities: [],
    contact_location: "",
    data_points: [],
    max_leads: 100,
  },
};

export default function NewCampaignPage() {
  const [step, setStep] = useState<WizardStepKey>("configure");
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const update = (updater: (prev: WizardState) => WizardState) => setState(updater);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">New Campaign</h2>
        <p className="text-sm text-muted-foreground">
          Set up your outbound campaign in five steps.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <Stepper current={step} />
        </CardContent>
      </Card>

      {step === "configure" && (
        <StepConfigure
          state={state}
          setState={update}
          onNext={() => setStep("source")}
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
          onBack={() => setStep("source")}
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
