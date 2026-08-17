import { supabase } from "@/lib/supabase";

interface LogActivityParams {
  orgId: string;
  actorId: string;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
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
