// Helpers for testing third-party API connections and managing Resend domains.
// Browsers may block some endpoints with CORS — failures surface as
// "connection failed" toasts. Real verification often needs a server proxy.

export interface TestResult {
  ok: boolean;
  message: string;
}

async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<{ res?: Response; error?: string }> {
  try {
    const res = await fetch(url, init);
    return { res };
  } catch (e: any) {
    return {
      error:
        e?.message ||
        "Network error (CORS may block this endpoint from the browser)",
    };
  }
}

export async function testLushaKey(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "Add an API key first" };
  const { res, error } = await safeFetch(
    "https://api.lusha.com/prospecting/filters/companies/sizes",
    { headers: { api_key: key } },
  );
  if (error) return { ok: false, message: error };
  if (res!.ok) return { ok: true, message: "Lusha connection OK" };
  return { ok: false, message: `Lusha responded ${res!.status}` };
}

export async function testNeverBounceKey(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "Add an API key first" };
  const { res, error } = await safeFetch(
    `https://api.neverbounce.com/v4.2/account/info?key=${encodeURIComponent(key)}`,
  );
  if (error) return { ok: false, message: error };
  if (!res!.ok) return { ok: false, message: `NeverBounce responded ${res!.status}` };
  const json: any = await res!.json().catch(() => ({}));
  if (json?.status === "success") return { ok: true, message: "NeverBounce connection OK" };
  return { ok: false, message: json?.message || "NeverBounce rejected the key" };
}

export async function testResendKey(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "Add an API key first" };
  const { res, error } = await safeFetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (error) return { ok: false, message: error };
  if (res!.ok) return { ok: true, message: "Resend connection OK" };
  return { ok: false, message: `Resend responded ${res!.status}` };
}

export interface ResendDnsRecord {
  record: string;
  name: string;
  type: string;
  ttl?: string;
  status: string;
  value: string;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  created_at?: string;
  region?: string;
  records?: ResendDnsRecord[];
}

export async function listResendDomains(key: string): Promise<ResendDomain[]> {
  if (!key) throw new Error("Missing Resend API key");
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Resend list domains failed (${res.status})`);
  const json: any = await res.json();
  return json?.data ?? [];
}

export async function getResendDomain(key: string, id: string): Promise<ResendDomain> {
  const res = await fetch(`https://api.resend.com/domains/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Resend get domain failed (${res.status})`);
  return await res.json();
}

export async function createResendDomain(
  key: string,
  name: string,
  region = "us-east-1",
): Promise<ResendDomain> {
  const res = await fetch("https://api.resend.com/domains", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, region }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend create domain failed (${res.status}): ${txt}`);
  }
  return await res.json();
}
