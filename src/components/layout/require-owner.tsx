// Owner-only pages. Admins run the team and the pipeline; the workspace
// configuration — the Odoo credentials above all — belongs to the owner
// alone. The database enforces the same rule (migration 0017), so this
// is about not showing someone a form they can't submit.
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { FullPageSpinner } from "@/components/ui/spinner";

export function RequireOwner({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth();

  if (loading || !profile) return <FullPageSpinner />;

  if (profile.role !== "owner") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold">Owner access only</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Workspace settings are managed by the workspace owner. Ask them if something here needs
            to change.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
