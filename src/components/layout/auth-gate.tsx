import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "./app-shell";
import { FullPageSpinner } from "@/components/ui/spinner";

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }
    if (profile && !profile.org_id) {
      navigate("/onboarding", { replace: true });
    }
  }, [loading, session, profile, navigate]);

  if (loading) return <FullPageSpinner />;
  if (!session) return null;
  if (profile && !profile.org_id) return null;

  return <AppShell>{children}</AppShell>;
}
