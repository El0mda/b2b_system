// Minimal hand-written types covering the Phase 1 schema.
// Regenerate from Supabase later with `supabase gen types typescript`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          plan: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          plan?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          org_id: string | null;
          full_name: string | null;
          email: string | null;
          role: string | null;
          avatar_url: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          org_id?: string | null;
          full_name?: string | null;
          email?: string | null;
          role?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          org_id: string | null;
          key: string;
          value: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          key: string;
          value: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          org_id: string | null;
          created_by: string | null;
          name: string;
          sender_email: string | null;
          sender_name: string | null;
          reply_to_email: string | null;
          timezone: string | null;
          status: string | null;
          source: string | null;
          lusha_request_id: string | null;
          leads_searched: number | null;
          leads_enriched: number | null;
          leads_verified: number | null;
          leads_added: number | null;
          leads_imported: number | null;
          resend_automation_id: string | null;
          filters: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          created_by?: string | null;
          name: string;
          sender_email?: string | null;
          sender_name?: string | null;
          reply_to_email?: string | null;
          timezone?: string | null;
          status?: string | null;
          source?: string | null;
          lusha_request_id?: string | null;
          leads_searched?: number | null;
          leads_enriched?: number | null;
          leads_verified?: number | null;
          leads_added?: number | null;
          leads_imported?: number | null;
          resend_automation_id?: string | null;
          filters?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          org_id: string | null;
          campaign_id: string | null;
          source: string | null;
          contact_id: string | null;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          email: string | null;
          email_type: string | null;
          company: string | null;
          job_title: string | null;
          location: string | null;
          linkedin_url: string | null;
          website: string | null;
          phone: string | null;
          has_work_email: boolean | null;
          has_phones: boolean | null;
          nb_result: string | null;
          nb_code: number | null;
          email_valid: boolean | null;
          is_duplicate: boolean | null;
          added_to_campaign: boolean | null;
          email_delivered: boolean | null;
          email_opened: boolean | null;
          email_opened_at: string | null;
          email_clicked: boolean | null;
          email_clicked_at: string | null;
          email_bounced: boolean | null;
          email_bounce_reason: string | null;
          current_step: number | null;
          reply_text: string | null;
          replied_at: string | null;
          synced_to_odoo: boolean | null;
          odoo_lead_id: string | null;
          created_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["leads"]["Row"]> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Row"]>;
        Relationships: [];
      };
      sequences: {
        Row: {
          id: string;
          campaign_id: string | null;
          step: number;
          delay_days: number | null;
          subject: string;
          body: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          campaign_id?: string | null;
          step: number;
          delay_days?: number | null;
          subject: string;
          body: string;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sequences"]["Insert"]>;
        Relationships: [];
      };
      sender_accounts: {
        Row: {
          id: string;
          org_id: string | null;
          sender_name: string;
          sender_email: string;
          reply_to_email: string | null;
          resend_domain_id: string | null;
          domain: string | null;
          domain_verified: boolean | null;
          is_default: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          sender_name: string;
          sender_email: string;
          reply_to_email?: string | null;
          resend_domain_id?: string | null;
          domain?: string | null;
          domain_verified?: boolean | null;
          is_default?: boolean | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sender_accounts"]["Insert"]>;
        Relationships: [];
      };
      webhook_logs: {
        Row: {
          id: string;
          org_id: string | null;
          event_type: string | null;
          source: string | null;
          campaign_name: string | null;
          lead_email: string | null;
          lead_name: string | null;
          payload: Json | null;
          processed: boolean | null;
          created_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["webhook_logs"]["Row"]> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["webhook_logs"]["Row"]>;
        Relationships: [];
      };
      imports: {
        Row: {
          id: string;
          org_id: string | null;
          campaign_id: string | null;
          file_name: string | null;
          file_url: string | null;
          total_rows: number | null;
          imported_rows: number | null;
          skipped_rows: number | null;
          duplicate_rows: number | null;
          status: string | null;
          error_message: string | null;
          created_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["imports"]["Row"]> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["imports"]["Row"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          org_id: string;
          plan: string | null;
          leads_quota_monthly: number | null;
          leads_used_this_month: number | null;
          quota_reset_date: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          plan?: string | null;
          leads_quota_monthly?: number | null;
          leads_used_this_month?: number | null;
          quota_reset_date?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string | null;
          email: string;
          role: string | null;
          token: string | null;
          invited_by: string | null;
          accepted_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          email: string;
          role?: string | null;
          token?: string | null;
          invited_by?: string | null;
          accepted_at?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          org_id: string | null;
          actor_id: string | null;
          action: string;
          summary: string;
          metadata: Record<string, unknown> | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          actor_id?: string | null;
          action: string;
          summary: string;
          metadata?: Record<string, unknown> | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
