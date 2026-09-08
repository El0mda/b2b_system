import { useEffect, useState } from "react";
import { Building2, Boxes, Loader2, CheckCircle2, Link2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const ODOO_KEYS = ["odoo_url", "odoo_db", "odoo_user_id", "odoo_api_key"] as const;

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

      <OdooConnectionCard orgId={organization?.id} />
    </div>
  );
}

function OdooConnectionCard({ orgId }: { orgId: string | undefined }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [db, setDb] = useState("");
  const [userId, setUserId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .eq("org_id", orgId)
        .in("key", ODOO_KEYS);
      const values: Record<string, string> = {};
      (data ?? []).forEach((row: any) => (values[row.key] = row.value));
      setUrl(values.odoo_url ?? "");
      setDb(values.odoo_db ?? "");
      setUserId(values.odoo_user_id ?? "");
      setApiKey(values.odoo_api_key ?? "");
      setConnected(!!(values.odoo_url && values.odoo_db && values.odoo_user_id && values.odoo_api_key));
      setLoading(false);
    })();
  }, [orgId]);

  const handleConnect = async () => {
    if (!orgId) return;
    if (!url.trim() || !db.trim() || !userId.trim() || !apiKey.trim()) {
      toast.error("Fill in all four fields to connect");
      return;
    }
    setSaving(true);
    try {
      const rows = [
        { org_id: orgId, key: "odoo_url", value: url.trim() },
        { org_id: orgId, key: "odoo_db", value: db.trim() },
        { org_id: orgId, key: "odoo_user_id", value: userId.trim() },
        { org_id: orgId, key: "odoo_api_key", value: apiKey.trim() },
        // Filling in the connection is what turns syncing on — no
        // separate toggle to remember to flip.
        { org_id: orgId, key: "odoo_auto_create_opportunities", value: "true" },
      ];
      const { error } = await supabase.from("settings").upsert(rows, { onConflict: "org_id,key" });
      if (error) throw error;
      setConnected(true);
      toast.success("Connected to Odoo");
    } catch (e: any) {
      toast.error(e?.message || "Failed to connect to Odoo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <CardTitle>Odoo CRM</CardTitle>
          </div>
          {!loading && (
            <Badge variant={connected ? "success" : "secondary"}>
              {connected ? (
                <>
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </>
              ) : (
                "Not connected"
              )}
            </Badge>
          )}
        </div>
        <CardDescription>
          Leads get pushed to Odoo automatically once they click or reply — deal progress from
          there on is managed inside Odoo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="odoo-url">Odoo URL</Label>
                <Input
                  id="odoo-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mycompany.odoo.com"
                />
                <p className="text-xs text-muted-foreground">
                  The address you use to log into Odoo.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odoo-db">Database</Label>
                <Input
                  id="odoo-db"
                  value={db}
                  onChange={(e) => setDb(e.target.value)}
                  placeholder="mycompany"
                />
                <p className="text-xs text-muted-foreground">
                  Settings → General Settings → Database in Odoo.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odoo-user-id">User ID</Label>
                <Input
                  id="odoo-user-id"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="2"
                />
                <p className="text-xs text-muted-foreground">
                  Settings → Users, open the account → the number in the page URL.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odoo-api-key">API Key</Label>
                <Input
                  id="odoo-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">
                  Your name (top right) → My Profile → Account Security → New API Key.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleConnect} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {connected ? "Update Connection" : "Connect to Odoo"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
