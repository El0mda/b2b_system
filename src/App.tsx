import { Navigate, Route, Routes } from "react-router-dom";

import { AuthGate } from "@/components/layout/auth-gate";
import { RequireOwner } from "@/components/layout/require-owner";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import OnboardingPage from "@/pages/onboarding";
import AcceptInvitePage from "@/pages/accept-invite";
import DashboardPage from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import TeamPage from "@/pages/team";
import CampaignsPage from "@/pages/campaigns";
import ImportPage from "@/pages/import";
import NewCampaignPage from "@/pages/campaigns-new";
import CampaignDetailPage from "@/pages/campaign-detail";
import LeadsPage from "@/pages/leads";
import SequencesPage from "@/pages/sequences";
import CrmPage from "@/pages/crm";
import AnalyticsPage from "@/pages/analytics";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn't exist.
        </p>
        <a
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Go to dashboard
        </a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />

      <Route
        path="/dashboard"
        element={
          <AuthGate>
            <DashboardPage />
          </AuthGate>
        }
      />
      <Route
        path="/campaigns"
        element={
          <AuthGate>
            <CampaignsPage />
          </AuthGate>
        }
      />
      <Route
        path="/campaigns/new"
        element={
          <AuthGate>
            <NewCampaignPage />
          </AuthGate>
        }
      />
      <Route
        path="/campaigns/:id"
        element={
          <AuthGate>
            <CampaignDetailPage />
          </AuthGate>
        }
      />
      <Route
        path="/leads"
        element={
          <AuthGate>
            <LeadsPage />
          </AuthGate>
        }
      />
      <Route
        path="/crm"
        element={
          <AuthGate>
            <CrmPage />
          </AuthGate>
        }
      />
      <Route
        path="/import"
        element={
          <AuthGate>
            <ImportPage />
          </AuthGate>
        }
      />
      <Route
        path="/analytics"
        element={
          <AuthGate>
            <AnalyticsPage />
          </AuthGate>
        }
      />
      <Route
        path="/sequences"
        element={
          <AuthGate>
            <SequencesPage />
          </AuthGate>
        }
      />
      <Route
        path="/settings"
        element={
          <AuthGate>
            <RequireOwner>
              <SettingsPage />
            </RequireOwner>
          </AuthGate>
        }
      />
      <Route
        path="/team"
        element={
          <AuthGate>
            <TeamPage />
          </AuthGate>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
