import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthBackdrop } from "@/components/layout/auth-backdrop";
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

export default function SignupPage() {
  const navigate = useNavigate();
  const { session, profile, loading, refresh } = useAuth();

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Once the form has been submitted, handleSubmit owns navigation from here
  // on — without this guard, this effect fires as soon as signUp() resolves
  // (session becomes non-null) but before handleSubmit has finished creating
  // the org/profile rows, sending the user to /onboarding's "no workspace"
  // fallback instead of the flow handleSubmit is about to navigate to.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (loading || !session || submittedRef.current) return;
    if (profile?.org_id) navigate("/dashboard", { replace: true });
    else navigate("/onboarding", { replace: true });
  }, [loading, session, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    submittedRef.current = true;
    if (!fullName || !companyName || !email || !password) {
      toast.error("All fields are required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const { data: signUp, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      if (signUpError) throw signUpError;
      const user = signUp.user;
      if (!user) throw new Error("Sign-up did not return a user");

      // If email confirmation is enabled in Supabase, signUp returns no session.
      // We can't create the org row as an unauthenticated user — RLS will reject it.
      if (!signUp.session) {
        toast.info("Check your email to confirm your account, then sign in.");
        navigate("/login", { replace: true });
        return;
      }

      // Create org. We generate the id client-side and skip .select() here:
      // the org's SELECT policy depends on current_org_id(), which reads
      // users.org_id — but that row doesn't exist until the insert below,
      // so reading the just-inserted org back (RETURNING) would fail RLS.
      const orgId = crypto.randomUUID();
      const { error: orgError } = await supabase
        .from("organizations")
        .insert({ id: orgId, name: companyName, slug: slugify(companyName) });
      if (orgError) throw orgError;

      // Create user profile linked to org as owner
      const { error: profileError } = await supabase.from("users").insert({
        id: user.id,
        org_id: orgId,
        full_name: fullName,
        email,
        role: "owner",
      });
      if (profileError) throw profileError;

      await refresh();
      toast.success("Welcome to Campaign Commander!");
      navigate("/onboarding", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Sign-up failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <AuthBackdrop />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle className="border border-border bg-card/60 backdrop-blur" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo} alt="etriplesoft" className="h-9 w-auto dark:hidden" />
          <img src={logoDark} alt="etriplesoft" className="hidden h-9 w-auto dark:block" />
          <p className="mt-3 text-sm text-muted-foreground">
            Campaign Commander — outbound automation for the team.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-7 shadow-premium-lg backdrop-blur-sm">
          <h2 className="mb-1 text-xl font-semibold tracking-tight">Create your account</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Set up your workspace in under a minute.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                placeholder="Khaled Ahmed"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={submitting}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Company name</Label>
              <Input
                id="company"
                placeholder="Acme Inc."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={submitting}
                autoComplete="organization"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Spinner />}
              Create account
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
