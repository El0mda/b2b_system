// The replies inbox: every lead who wrote back, as a conversation.
//
// A conversation is a lead with a reply. Threads are read from SmartLead
// on demand through the smartlead-inbox function (the key is server-side),
// and "unread" is last_reply_at being newer than the last time the
// salesperson opened it (migration 0023).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { getFunctionErrorMessage } from "@/lib/utils";

export interface Conversation {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  reply_read_at: string | null;
  reply_text: string | null;
  campaign_id: string | null;
  campaigns: { name: string } | null;
}

export interface ThreadMessage {
  type: "sent" | "reply";
  time: string | null;
  subject: string | null;
  text: string;
}

export function conversationName(c: Pick<Conversation, "full_name" | "first_name" | "last_name" | "email">): string {
  return (
    c.full_name?.trim() ||
    `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
    c.email ||
    "Unknown lead"
  );
}

export function isUnread(c: Pick<Conversation, "last_reply_at" | "replied_at" | "reply_read_at">): boolean {
  const last = c.last_reply_at ?? c.replied_at;
  if (!last) return false;
  if (!c.reply_read_at) return true;
  return new Date(last).getTime() > new Date(c.reply_read_at).getTime();
}

const POLL_MS = 60_000;

/**
 * Everyone who replied, newest activity first. Row-level security scopes
 * this to the caller's own campaigns (owner/admin see the whole team).
 */
export function useConversations(orgId: string | undefined) {
  return useQuery<Conversation[]>({
    queryKey: ["inbox", orgId],
    enabled: !!orgId,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, first_name, last_name, full_name, email, company, job_title, phone, replied_at, last_reply_at, reply_read_at, reply_text, campaign_id, campaigns(name)",
        )
        .eq("org_id", orgId!)
        .not("replied_at", "is", null)
        .order("last_reply_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });
}

export function useThread(leadId: string | null) {
  return useQuery<ThreadMessage[]>({
    queryKey: ["inbox-thread", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("smartlead-inbox", {
        body: { action: "thread", lead_id: leadId },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.messages ?? []) as ThreadMessage[];
    },
  });
}

export function useInboxActions(orgId: string | undefined) {
  const qc = useQueryClient();

  // Optimistic: the unread dot disappears the moment a conversation opens,
  // rather than after the round trip.
  const markRead = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ reply_read_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw error;
    },
    onMutate: (leadId) => {
      const now = new Date().toISOString();
      qc.setQueryData<Conversation[]>(["inbox", orgId], (list) =>
        list?.map((c) => (c.id === leadId ? { ...c, reply_read_at: now } : c)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox", orgId] }),
  });

  const sendReply = useMutation({
    mutationFn: async ({ leadId, body }: { leadId: string; body: string }) => {
      const { data, error } = await supabase.functions.invoke("smartlead-inbox", {
        body: { action: "reply", lead_id: leadId, body },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: (_r, { leadId }) => {
      toast.success("Reply sent");
      qc.invalidateQueries({ queryKey: ["inbox-thread", leadId] });
      qc.invalidateQueries({ queryKey: ["inbox", orgId] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't send the reply"),
  });

  return { markRead, sendReply };
}
