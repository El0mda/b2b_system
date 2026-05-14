import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Database,
  Webhook,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner, FullPageSpinner } from "@/components/ui/spinner";
import { testOdooConnection } from "@/lib/integrations";
import { cn } from "@/lib/utils";

type SettingsMap = Record<string, string>;

interface Subscription {
  plan: string | null;
  leads_quota_monthly: number | null;
  leads_used_this_month: number | null;
  quota_reset_date: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
};

export default function SettingsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: settings = {}, isLoading: settingsLoading } = useQuery<SettingsMap>({
    queryKey: ["settings", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("key, value")
        .eq("org_id", orgId!);
      if (error) throw error;
      const map: SettingsMap = {};
      (data ?? []).forEach((row) => {
        map[row.key] = row.value;
      });
      return map;
    },
  });

  const { data: subscription, isLoading: subLoading } = useQuery<Subscription | null>({
    queryKey: ["subscription", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan, leads_quota_monthly, leads_used_this_month, quota_reset_date")
        .eq("org_id", orgId!)
        .maybeSingle();
      return data ?? null;
    },
  });

  const saveSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      if (!orgId) throw new Error("No organization");
      const { data: existing } = await supabase
        .from("settings")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", key)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("settings")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ org_id: orgId, key, value });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", orgId] }),
  });

  const webhookOrigin = useMemo(() => {
    if (typeof window === "undefined") return "https://your-app.com";
    return window.location.origin;
  }, []);
  const eventsWebhook = `${webhookOrigin}/api/webhooks/resend-events`;
  const inboundWebhook = `${webhookOrigin}/api/webhooks/resend-inbound`;

  const { data: lastWebhook } = useQuery({
    queryKey: ["last-webhook", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("webhook_logs")
        .select("created_at, source")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (settingsLoading || subLoading) return <FullPageSpinner />;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your plan, CRM connection, and webhooks.
        </p>
      </div>

      <PlanUsageCard subscription={subscription ?? null} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>Odoo CRM</CardTitle>
          </div>
          <CardDescription>
            Connect Odoo to sync leads as opportunities in your CRM pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OdooSection
            settings={settings}
            onSave={(key, value) => saveSetting.mutateAsync({ key, value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <CardTitle>Reply Webhook Setup</CardTitle>
          </div>
          <CardDescription>
            Copy these URLs into your inbound provider so we can ingest delivery events and replies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <WebhookRow
            title="Delivery Events Webhook"
            url={eventsWebhook}
            instructions={[
              "Open your delivery dashboard → Webhooks → Add",
              "Select events: delivered, opened, clicked, bounced, complained",
              "Paste this URL",
            ]}
          />
          <div className="h-px bg-border" />
          <WebhookRow
            title="Inbound Reply Webhook"
            url={inboundWebhook}
            instructions={[
              "Open Inbound settings",
              "Set webhook URL for your reply-to domain",
            ]}
          />
          <div className="pt-2 text-xs text-muted-foreground">
            Last webhook received:{" "}
            {lastWebhook?.created_at
              ? `${new Date(lastWebhook.created_at).toLocaleString()} (${lastWebhook.source ?? "unknown"})`
              : "never"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanUsageCard({ subscription }: { subscription: Subscription | null }) {
  const plan = subscription?.plan ?? "starter";
  const quota = subscription?.leads_quota_monthly ?? 1000;
  const used = subscription?.leads_used_this_month ?? 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const resetDate = subscription?.quota_reset_date
    ? new Date(subscription.quota_reset_date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Plan & Usage</CardTitle>
        </div>
        <CardDescription>
          Your current Campaign Commander plan and this month's lead usage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plan
            </div>
            <div className="mt-1 text-2xl font-bold">{PLAN_LABELS[plan] ?? plan}</div>
            {resetDate && (
              <div className="mt-1 text-xs text-muted-foreground">
                Quota resets {resetDate}
              </div>
            )}
          </div>
          <Button onClick={() => toast.info("Upgrades coming soon.")}>Upgrade</Button>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-medium">Leads used this month</span>
            <span className="text-muted-foreground">
              {used.toLocaleString()} / {quota.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {pct >= 90 && (
            <p className="mt-2 text-xs text-destructive">
              You've used {pct}% of this month's quota. Upgrade to keep sending without interruption.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OdooSection({
  settings,
  onSave,
}: {
  settings: SettingsMap;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(settings.odoo_url ?? "");
  const [db, setDb] = useState(settings.odoo_db ?? "");
  const [userId, setUserId] = useState(settings.odoo_user_id ?? "");
  const [apiKey, setApiKey] = useState(settings.odoo_api_key ?? "");
  const [show, setShow] = useState(false);
  const [autoCreate, setAutoCreate] = useState(
    settings.odoo_auto_create_opportunities === "true",
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setUrl(settings.odoo_url ?? "");
    setDb(settings.odoo_db ?? "");
    setUserId(settings.odoo_user_id ?? "");
    setApiKey(settings.odoo_api_key ?? "");
    setAutoCreate(settings.odoo_auto_create_opportunities === "true");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        onSave("odoo_url", url),
        onSave("odoo_db", db),
        onSave("odoo_user_id", userId),
        onSave("odoo_api_key", apiKey),
      ]);
      toast.success("Odoo settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save Odoo settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testOdooConnection({
        url,
        db,
        userId: Number(userId),
        apiKey,
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setTesting(false);
    }
  };

  const handleAutoToggle = async (next: boolean) => {
    setAutoCreate(next);
    try {
      await onSave("odoo_auto_create_opportunities", next ? "true" : "false");
    } catch (e: any) {
      setAutoCreate(!next);
      toast.error(e?.message || "Failed to update toggle");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="odoo-url">Odoo URL</Label>
          <Input
            id="odoo-url"
            placeholder="https://yourcompany.odoo.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="odoo-db">Database Name</Label>
          <Input
            id="odoo-db"
            placeholder="yourcompany"
            value={db}
            onChange={(e) => setDb(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="odoo-user">User ID</Label>
          <Input
            id="odoo-user"
            type="number"
            placeholder="2"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Find at Settings → Users → click your user → check URL for id=X
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="odoo-key">API Key</Label>
          <div className="relative">
            <Input
              id="odoo-key"
              type={show ? "text" : "password"}
              placeholder="Odoo API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Spinner />} Save
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing}>
          {testing && <Spinner />} Test Connection
        </Button>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          <div className="text-sm font-medium">Auto-create opportunities on reply</div>
          <p className="mt-1 text-xs text-muted-foreground">
            When a lead replies, automatically push it as an opportunity in Odoo.
          </p>
        </div>
        <Switch checked={autoCreate} onCheckedChange={handleAutoToggle} />
      </div>
    </div>
  );
}

function WebhookRow({
  title,
  url,
  instructions,
}: {
  title: string;
  url: string;
  instructions: string[];
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="mb-3 flex gap-2">
        <Input value={url} readOnly className="font-mono text-xs" />
        <Button variant="outline" onClick={handleCopy} className="shrink-0">
          {copied ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Copy
        </Button>
      </div>
      <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
        {instructions.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {!url.startsWith("https://") && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            HTTPS is required by most providers — deploy this app to a public URL before configuring
            the webhook.
          </span>
        </div>
      )}
    </div>
  );
}
