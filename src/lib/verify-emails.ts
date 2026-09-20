// Email verification, via Emailable (the emailable-verify function).
//
// SmartLead was tried first — its plan includes verification credits —
// but that turned out to be a dashboard-only feature: the API key is
// rejected on the verification route. Emailable exposes a real API, so
// the app verifies through that instead.
//
// Results are stored in the existing leads.nb_result /
// leads.email_valid columns — the names still say NeverBounce, but the
// vocabulary is the same and renaming them would churn every filter,
// badge and chart for no behavioural gain.
import { supabase } from "@/lib/supabase";

export interface VerificationResult {
  result: string | null;
  valid: boolean | null;
}

// Emailable verifies one address per request, so the edge function fans
// a batch out internally. 50 keeps a single invocation well inside its
// execution budget even when every address needs a slow SMTP probe.
const BATCH_SIZE = 50;

export const UNVERIFIED: VerificationResult = { result: null, valid: null };

// Keyed by lowercased email, because that's the only identifier that
// survives the round trip to the verification provider.
export type VerificationMap = Map<string, VerificationResult>;

export function lookupVerification(map: VerificationMap, email: string): VerificationResult {
  return map.get(email.toLowerCase()) ?? { result: "skipped", valid: null };
}

/**
 * Verifies a list of addresses. Never throws: verification is an
 * enhancement to an import, and a failed check shouldn't cost someone
 * their leads. A batch that fails comes back as "skipped".
 *
 * `onProgress` reports addresses completed, for a progress indicator.
 */
export async function verifyEmails(
  emails: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<VerificationMap> {
  const map: VerificationMap = new Map();

  // De-duplicated so the same address never burns two credits.
  const unique = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))),
  );
  if (unique.length === 0) return map;

  let done = 0;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await supabase.functions.invoke("emailable-verify", {
        body: { emails: batch },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      for (const row of (data as any)?.results ?? []) {
        if (typeof row?.email !== "string") continue;
        map.set(row.email.toLowerCase(), {
          result: row.result ?? "skipped",
          valid: row.valid ?? null,
        });
      }
    } catch (e) {
      console.error("Email verification batch failed:", e);
      for (const email of batch) map.set(email, { result: "skipped", valid: null });
    }
    done += batch.length;
    onProgress?.(Math.min(done, unique.length), unique.length);
  }

  return map;
}

// Human-readable summary for a toast after an import.
export function summarizeVerification(map: VerificationMap): string {
  let valid = 0;
  let invalid = 0;
  let other = 0;
  for (const { result } of map.values()) {
    if (result === "valid" || result === "catchall") valid++;
    else if (result === "invalid" || result === "disposable") invalid++;
    else other++;
  }
  const parts = [`${valid} valid`];
  if (invalid > 0) parts.push(`${invalid} invalid`);
  if (other > 0) parts.push(`${other} unverified`);
  return parts.join(", ");
}
