// Notes on a lead, written from the Pipeline. Saving goes through the
// lead-notes function, which also posts the note onto the lead's Odoo
// opportunity when there is one; a note on a lead not yet in Odoo is
// sent across when the lead is pushed (migration 0033).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { getFunctionErrorMessage } from "@/lib/utils";

export interface LeadNote {
  id: string;
  lead_id: string;
  author_id: string | null;
  body: string;
  odoo_message_id: string | null;
  created_at: string;
  users: { full_name: string | null; email: string | null } | null;
}

export function useLeadNotes(leadId: string | null) {
  return useQuery<LeadNote[]>({
    queryKey: ["lead-notes", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_notes")
        .select("id, lead_id, author_id, body, odoo_message_id, created_at, users:author_id(full_name, email)")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LeadNote[];
    },
  });
}

export function useAddLeadNote(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await supabase.functions.invoke("lead-notes", {
        body: { lead_id: leadId, body },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { odoo: "posted" | "pending" | "failed" };
    },
    onSuccess: ({ odoo }) => {
      if (odoo === "posted") toast.success("Note saved and added to the Odoo opportunity");
      else if (odoo === "pending")
        toast.success("Note saved — it goes to Odoo when this lead is pushed there");
      else toast.warning("Note saved, but Odoo didn't accept it — it'll retry on the next push");
      qc.invalidateQueries({ queryKey: ["lead-notes", leadId] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't save the note"),
  });
}

export function useDeleteLeadNote(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("lead_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-notes", leadId] }),
    onError: (e: any) => toast.error(e?.message || "Couldn't delete the note"),
  });
}
