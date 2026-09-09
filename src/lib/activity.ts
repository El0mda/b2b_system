import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/db";

interface LogActivityParams {
  orgId: string;
  actorId: string;
  action: string;
  summary: string;
  // Matches the jsonb column: anything stored here has to survive a
  // round-trip through JSON, which Record<string, unknown> doesn't promise.
  metadata?: { [key: string]: Json };
}

// Fire-and-forget: never let a logging failure break the action it's
// attached to. Callers should not await this in a way that blocks the UI.
export async function logActivity({
  orgId,
  actorId,
  action,
  summary,
  metadata,
}: LogActivityParams): Promise<void> {
  try {
    const { error } = await supabase.from("activity_log").insert({
      org_id: orgId,
      actor_id: actorId,
      action,
      summary,
      metadata: metadata ?? {},
    });
    if (error) console.error("logActivity failed:", error);
  } catch (e) {
    console.error("logActivity failed:", e);
  }
}
