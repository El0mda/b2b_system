import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, ArrowLeft, Sparkles, Building2, KeyRound, Rocket } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner, FullPageSpinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthBackdrop } from "@/components/layout/auth-backdrop";
import { cn } from "@/lib/utils";
import logo from "@/assets/company_logo.png";
import logoDark from "@/assets/company_logo_dark.png";

function slugify(s: string) {
  const base = s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : suffix;
}

type StepKey = "welcome" | "managed" | "done";

interface Step {
  key: StepKey;
  label: string;
  description: string;
  icon: typeof Rocket;
}

const STEPS: Step[] = [
  {
    key: "welcome",
    label: "Welcome",
    description: "Let's get your workspace set up.",
    icon: Rocket,
  },
  {
    key: "managed",
    label: "API services",
    description: "Lead enrichment, email sending, and verification are handled for you.",
    icon: Sparkles,
  },
  {
    key: "done",
    label: "All set",
    description: "Your workspace is ready to launch campaigns.",
    icon: Check,
  },
];

function LogoMark() {
  return (
    <div className="mb-3 flex flex-col items-center">
      <img src={logo} alt="etriplesoft" className="h-8 w-auto dark:hidden" />
      <img src={logoDark} alt="etriplesoft" className="hidden h-8 w-auto dark:block" />
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { session, user, profile, organization, loading, refresh } = useAuth();
  const [stepIdx, setStepIdx] = useState(0);

  // Workspace bootstrap state — used when the auth user has no profile/org yet.
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setFullName(String(user.user_metadata.full_name));
    } else if (user?.email) {
      setFullName(user.email.split("@")[0] ?? "");
    }
  }, [user]);

  if (loading) return <FullPageSpinner />;
  if (!session) return null;

  const needsWorkspace = !profile?.org_id && !organization;

  const handleBootstrap = async () => {
    if (!user) return;
    if (!companyName.trim() || !fullName.trim()) {
      toast.error("Both fields are required");
      return;
    }
    setBootstrapping(true);
    try {
      // Generate the id client-side and skip .select() here: the org's
      // SELECT policy depends on current_org_id(), which reads users.org_id
      // — but that row doesn't exist until the upsert below, so reading the
      // just-inserted org back (RETURNING) would fail RLS.
      const orgId = crypto.randomUUID();
      const { error: orgError } = await supabase.from("organizations").insert({
        id: orgId,
        name: companyName.trim(),
        slug: slugify(companyName.trim()),
      });
      if (orgError) throw orgError;

      const { error: profileError } = await supabase.from("users").upsert(
        {
          id: user.id,
          org_id: orgId,
          full_name: fullName.trim(),
          email: user.email,
          role: "owner",
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      await refresh();
      toast.success("Workspace ready!");
    } catch (e: any) {
      toast.error(e?.message || "Could not create workspace");
    } finally {
      setBootstrapping(false);
    }
  };

  const step = STEPS[stepIdx];
  const Icon = step.icon;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  const next = () => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  const back = () => setStepIdx((i) => Math.max(0, i - 1));
  const finish = () => navigate("/dashboard", { replace: true });

  if (needsWorkspace) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <AuthBackdrop />
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle className="border border-border bg-card/60 backdrop-blur" />
        </div>
        <div className="relative z-10 w-full max-w-md animate-slide-up">
          <div className="mb-6 text-center">
            <LogoMark />
            <h1 className="text-xl font-semibold tracking-tight">Welcome to Campaign Commander</h1>
            <p className="mt-1 text-sm text-muted-foreground">Let's set up your workspace.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-7 shadow-premium-lg backdrop-blur-sm">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Create your workspace</h2>
                <p className="text-sm text-muted-foreground">
                  Tell us your name and company so we can finish setup.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bootstrap-name">Your name</Label>
                <Input
                  id="bootstrap-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={bootstrapping}
                  placeholder="Khaled Ahmed"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bootstrap-company">Company name</Label>
                <Input
                  id="bootstrap-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={bootstrapping}
                  placeholder="Acme Inc."
                />
              </div>
              <Button className="w-full" onClick={handleBootstrap} disabled={bootstrapping}>
                {bootstrapping && <Spinner />}
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <AuthBackdrop />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle className="border border-border bg-card/60 backdrop-blur" />
      </div>

      <div className="relative z-10 w-full max-w-2xl animate-slide-up">
        <div className="mb-6 text-center">
          <LogoMark />
          <h1 className="text-xl font-semibold tracking-tight">Welcome to Campaign Commander</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A few quick steps and you're ready to launch your first campaign.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between gap-1">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  i < stepIdx
                    ? "bg-primary text-primary-foreground"
                    : i === stepIdx
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {i < stepIdx ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-1 h-0.5 flex-1 rounded",
                    i < stepIdx ? "bg-primary" : "bg-muted",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-8 shadow-premium-lg backdrop-blur-sm">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{step.label}</h2>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          </div>

          {step.key === "welcome" && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                You'll be sending campaigns from your own assigned address, with leads sourced and
                verified by Campaign Commander.
              </p>
            </div>
          )}

          {step.key === "managed" && (
            <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm">
              <div className="flex items-start gap-2">
                <CheckPill /> Lead search & enrichment included
              </div>
              <div className="flex items-start gap-2">
                <CheckPill /> Email verification included
              </div>
              <div className="flex items-start gap-2">
                <CheckPill /> Managed sending domain — no DNS to configure
              </div>
              <p className="pt-2 text-xs text-emerald-700 dark:text-emerald-400">
                API services are handled by Campaign Commander ✓
              </p>
            </div>
          )}

          {step.key === "done" && (
            <div className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
              You're ready. Head to the dashboard and create your first campaign.
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={back} disabled={isFirst}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>

            <div className="flex items-center gap-2">
              {isLast ? (
                <Button onClick={finish}>
                  Go to dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={next}>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckPill() {
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
      <KeyRound className="h-2.5 w-2.5" />
    </span>
  );
}
