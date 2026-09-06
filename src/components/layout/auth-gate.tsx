import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "./app-shell";
import { FullPageSpinner } from "@/components/ui/spinner";

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }
    if (profile && !profile.org_id) {
      navigate("/onboarding", { replace: true });
      return;
    }
    // Tech Team members only work their task queue — keep them out of
    // the rest of the CRM/campaign flow.
    if (profile?.role === "tech" && location.pathname !== "/tasks") {
      navigate("/tasks", { replace: true });
    }
  }, [loading, session, profile, navigate, location.pathname]);

  if (loading) return <FullPageSpinner />;
  if (!session) return null;
  if (profile && !profile.org_id) return null;

  return <AppShell>{children}</AppShell>;
}
