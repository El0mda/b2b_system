import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Rocket } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

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
  const { session, profile, loading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    if (profile?.org_id) navigate("/dashboard", { replace: true });
    else navigate("/onboarding", { replace: true });
  }, [loading, session, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // Create org
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ name: companyName, slug: slugify(companyName) })
        .select()
        .single();
      if (orgError) throw orgError;

      // Create user profile linked to org as owner
      const { error: profileError } = await supabase.from("users").insert({
        id: user.id,
        org_id: org.id,
        full_name: fullName,
        email,
        role: "owner",
      });
      if (profileError) throw profileError;

      toast.success("Welcome to Campaign Commander!");
      navigate("/onboarding", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Sign-up failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Rocket className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Campaign Commander</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Outbound sales automation, all in one place.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">Create your account</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Start your free workspace in under a minute.
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
