// Sender accounts: the address a campaign sends from.
//
// Two separate things have to line up before a rep can send:
//   1. a sender_accounts row here, owned by them (migration 0020), and
//   2. the same mailbox connected inside SmartLead, which is what
//      actually sends.
//
// Only the first is under this app's control, so the UI shows the second
// as live status rather than pretending it's configured here.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface SenderAccount {
  id: string;
  org_id: string | null;
  user_id: string | null;
  sender_name: string;
  sender_email: string;
  domain: string | null;
  is_default: boolean | null;
  created_at: string | null;
}

export interface ConnectedMailbox {
  id: number | null;
  from_email: string;
  from_name: string | null;
  warmup_status: string | null;
  daily_limit: number | null;
}

const SELECT = "id, org_id, user_id, sender_name, sender_email, domain, is_default, created_at";

/**
 * The caller's own sender accounts, plus any legacy unowned ones (those
 * predate ownership and read as shared). Row-level security already
 * enforces this; `mine` only narrows an owner/admin's wider view.
 */
export function useSenderAccounts(
  orgId: string | undefined,
  userId: string | null | undefined,
  opts: { mine?: boolean } = {},
) {
  const { mine = true } = opts;
  return useQuery<SenderAccount[]>({
    queryKey: ["sender-accounts", orgId, mine ? userId : "all"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sender_accounts")
        .select(SELECT)
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as SenderAccount[];
      if (!mine || !userId) return rows;
      return rows.filter((a) => a.user_id === userId || a.user_id === null);
    },
  });
}

/**
 * Mailboxes actually connected in SmartLead. Returns an empty list (not
 * an error) when SmartLead can't be reached, so the page still renders
 * — status simply shows as unknown rather than blocking the UI.
 */
export function useConnectedMailboxes() {
  return useQuery<{ accounts: ConnectedMailbox[]; reachable: boolean }>({
    queryKey: ["smartlead-mailboxes"],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke("smartlead-accounts", {
          body: {},
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        return { accounts: ((data as any)?.accounts ?? []) as ConnectedMailbox[], reachable: true };
      } catch (e) {
        console.error("Couldn't list SmartLead mailboxes:", e);
        return { accounts: [], reachable: false };
      }
    },
  });
}

export function findMailbox(
  mailboxes: ConnectedMailbox[],
  email: string | null | undefined,
): ConnectedMailbox | null {
  if (!email) return null;
  const needle = email.toLowerCase().trim();
  return mailboxes.find((m) => m.from_email === needle) ?? null;
}

// A campaign whose sender isn't connected in SmartLead is created but
// never sends, so this is the check worth making before launching.
export function isSendable(
  mailboxes: ConnectedMailbox[],
  reachable: boolean,
  email: string | null | undefined,
): boolean {
  // If SmartLead is unreachable we can't prove it either way; don't
  // block the user on our own connectivity problem.
  if (!reachable) return true;
  return !!findMailbox(mailboxes, email);
}
