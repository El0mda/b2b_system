import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, AlertCircle, CheckCircle2, LogOut } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner, FullPageSpinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthBackdrop } from "@/components/layout/auth-backdrop";
import logo from "@/assets/company_logo.png";
import logoDark from "@/assets/company_logo_dark.png";

interface InvitePreview {
  org_name: string;
  email: string;
  role: string;
  is_expired: boolean;
  is_accepted: boolean;
}

function Shell({ children }: { children: React.ReactNode }) {
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
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, user, profile, loading: authLoading, refresh, signOut } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
      if (error || !data || data.length === 0) {
        setPreviewError("This invitation link is invalid.");
      } else {
        setPreview(data[0] as InvitePreview);
      }
      setPreviewLoading(false);
    })();
  }, [token]);

  const doAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
      if (error) throw error;
      await refresh();
      toast.success(`Welcome to ${data?.[0]?.org_name ?? "the team"}!`);
      navigate("/dashboard", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Could not accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;
    if (!fullName.trim() || password.length < 8) {
      toast.error("Enter your name and an 8+ character password");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: preview.email,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) throw error;
      if (!data.session) {
        toast.info("Check your email to confirm your account, then come back to this link.");
        return;
      }
      await doAccept();
    } catch (e: any) {
      toast.error(e?.message || "Sign-up failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: preview.email, password });
      if (error) throw error;
      await doAccept();
    } catch (e: any) {
      toast.error(e?.message || "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (previewLoading || authLoading) return <FullPageSpinner />;

  if (previewError || !preview) {
    return (
      <Shell>
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h2 className="text-lg font-semibold">Invalid invitation</h2>
          <p className="mt-1 text-sm text-muted-foreground">{previewError}</p>
          <Button asChild className="mt-5 w-full">
            <Link to="/login">Go to login</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (preview.is_accepted) {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
          <h2 className="text-lg font-semibold">Already accepted</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This invitation has already been used. Sign in to your account instead.
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/login">Go to login</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (preview.is_expired) {
    return (
      <Shell>
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h2 className="text-lg font-semibold">Invitation expired</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask {preview.org_name} to send you a new invite.
          </p>
        </div>
      </Shell>
    );
  }

  // Logged in as someone other than the invited email, or already in a org.
  if (session && user) {
    const emailMismatch = (user.email ?? "").toLowerCase() !== preview.email.toLowerCase();
    const alreadyInOrg = !!profile?.org_id;
    if (emailMismatch || alreadyInOrg) {
      return (
        <Shell>
          <div className="text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            <h2 className="text-lg font-semibold">
              {emailMismatch ? "Wrong account" : "Already in a workspace"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {emailMismatch
                ? `This invite was sent to ${preview.email}, but you're signed in as ${user.email}.`
                : "You already belong to a workspace. Multi-workspace accounts aren't supported yet."}
            </p>
            <Button
              variant="outline"
              className="mt-5 w-full"
              onClick={async () => {
                await signOut();
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out and try again
            </Button>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <div className="text-center">
          <h2 className="mb-1 text-xl font-semibold tracking-tight">
            Join {preview.org_name}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            You've been invited as a <strong className="text-foreground">{preview.role}</strong>.
          </p>
          <Button className="w-full" onClick={doAccept} disabled={accepting}>
            {accepting && <Spinner />}
            Accept invitation
            {!accepting && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </Shell>
    );
  }

  // Not authenticated — sign up (default) or log in, both scoped to the
  // invited email.
  return (
    <Shell>
      <h2 className="mb-1 text-xl font-semibold tracking-tight">Join {preview.org_name}</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        You've been invited as a <strong className="text-foreground">{preview.role}</strong>.
        {mode === "signup" ? " Create an account to accept." : " Sign in to accept."}
      </p>
      <form onSubmit={mode === "signup" ? handleSignup : handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={preview.email} disabled />
        </div>
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Your name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
              placeholder="Khaled Ahmed"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Spinner />}
          {mode === "signup" ? "Create account & join" : "Sign in & join"}
          {!submitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Need an account?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </>
        )}
      </p>
    </Shell>
  );
}
