import { Building2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  const { organization } = useAuth();

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Workspace</CardTitle>
          </div>
          <CardDescription>Your organization's details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </div>
            <div className="mt-1 text-lg font-semibold">{organization?.name ?? "—"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
