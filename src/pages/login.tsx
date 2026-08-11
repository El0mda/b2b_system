import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
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

export default function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    navigate("/dashboard", { replace: true });
  }, [loading, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter email and password");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
    } catch (e: any) {
      toast.error(e?.message || "Sign-in failed");
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

      <div className="relative z-10 w-full max-w-sm animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo} alt="etriplesoft" className="h-9 w-auto dark:hidden" />
          <img src={logoDark} alt="etriplesoft" className="hidden h-9 w-auto dark:block" />
          <p className="mt-3 text-sm text-muted-foreground">Campaign Commander</p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-7 shadow-premium-lg backdrop-blur-sm">
          <h2 className="mb-1 text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mb-6 text-sm text-muted-foreground">Welcome back — let's get to work.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Spinner />}
              Sign in
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
