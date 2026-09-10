// Generated from the live Supabase schema:
//   supabase gen types typescript --project-id pkfprsxpvjjiszqweqfy --schema public
// Regenerate after any migration rather than hand-editing.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          org_id: string | null
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_cache: {
        Row: {
          cache_key: string
          created_at: string
          id: string
          response_data: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          id?: string
          response_data?: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          id?: string
          response_data?: Json
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          filters: Json | null
          id: string
          leads_added: number | null
          leads_enriched: number | null
          leads_imported: number | null
          leads_searched: number | null
          leads_verified: number | null
          lusha_request_id: string | null
          name: string
          org_id: string | null
          reply_to_email: string | null
          resend_automation_id: string | null
          sender_email: string | null
          sender_name: string | null
          smartlead_campaign_id: string | null
          source: string | null
          status: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          filters?: Json | null
          id?: string
          leads_added?: number | null
          leads_enriched?: number | null
          leads_imported?: number | null
          leads_searched?: number | null
          leads_verified?: number | null
          lusha_request_id?: string | null
          name: string
          org_id?: string | null
          reply_to_email?: string | null
          resend_automation_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          smartlead_campaign_id?: string | null
          source?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          filters?: Json | null
          id?: string
          leads_added?: number | null
          leads_enriched?: number | null
          leads_imported?: number | null
          leads_searched?: number | null
          leads_verified?: number | null
          lusha_request_id?: string | null
          name?: string
          org_id?: string | null
          reply_to_email?: string | null
          resend_automation_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          smartlead_campaign_id?: string | null
          source?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          duplicate_rows: number | null
          error_message: string | null
          file_name: string | null
          file_url: string | null
          id: string
          imported_rows: number | null
          org_id: string | null
          skipped_rows: number | null
          status: string | null
          total_rows: number | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          duplicate_rows?: number | null
          error_message?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          imported_rows?: number | null
          org_id?: string | null
          skipped_rows?: number | null
          status?: string | null
          total_rows?: number | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          duplicate_rows?: number | null
          error_message?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          imported_rows?: number | null
          org_id?: string | null
          skipped_rows?: number | null
          status?: string | null
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          org_id: string | null
          role: string | null
          token: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          org_id?: string | null
          role?: string | null
          token?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          org_id?: string | null
          role?: string | null
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          added_to_campaign: boolean | null
          campaign_id: string | null
          company: string | null
          contact_id: string | null
          created_at: string | null
          current_step: number | null
          email: string | null
          email_bounce_reason: string | null
          email_bounced: boolean | null
          email_clicked: boolean | null
          email_clicked_at: string | null
          email_delivered: boolean | null
          email_opened: boolean | null
          email_opened_at: string | null
          email_type: string | null
          email_valid: boolean | null
          first_name: string | null
          full_name: string | null
          has_phones: boolean | null
          has_work_email: boolean | null
          id: string
          is_duplicate: boolean | null
          job_title: string | null
          last_name: string | null
          linkedin_url: string | null
          location: string | null
          nb_code: number | null
          nb_result: string | null
          odoo_expected_revenue: number | null
          odoo_lead_id: string | null
          odoo_stage: string | null
          odoo_stage_synced_at: string | null
          odoo_won: boolean | null
          org_id: string | null
          phone: string | null
          replied_at: string | null
          reply_text: string | null
          smartlead_lead_id: string | null
          source: string | null
          synced_to_odoo: boolean | null
          website: string | null
        }
        Insert: {
          added_to_campaign?: boolean | null
          campaign_id?: string | null
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_step?: number | null
          email?: string | null
          email_bounce_reason?: string | null
          email_bounced?: boolean | null
          email_clicked?: boolean | null
          email_clicked_at?: string | null
          email_delivered?: boolean | null
          email_opened?: boolean | null
          email_opened_at?: string | null
          email_type?: string | null
          email_valid?: boolean | null
          first_name?: string | null
          full_name?: string | null
          has_phones?: boolean | null
          has_work_email?: boolean | null
          id?: string
          is_duplicate?: boolean | null
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          nb_code?: number | null
          nb_result?: string | null
          odoo_expected_revenue?: number | null
          odoo_lead_id?: string | null
          odoo_stage?: string | null
          odoo_stage_synced_at?: string | null
          odoo_won?: boolean | null
          org_id?: string | null
          phone?: string | null
          replied_at?: string | null
          reply_text?: string | null
          smartlead_lead_id?: string | null
          source?: string | null
          synced_to_odoo?: boolean | null
          website?: string | null
        }
        Update: {
          added_to_campaign?: boolean | null
          campaign_id?: string | null
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_step?: number | null
          email?: string | null
          email_bounce_reason?: string | null
          email_bounced?: boolean | null
          email_clicked?: boolean | null
          email_clicked_at?: string | null
          email_delivered?: boolean | null
          email_opened?: boolean | null
          email_opened_at?: string | null
          email_type?: string | null
          email_valid?: boolean | null
          first_name?: string | null
          full_name?: string | null
          has_phones?: boolean | null
          has_work_email?: boolean | null
          id?: string
          is_duplicate?: boolean | null
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          nb_code?: number | null
          nb_result?: string | null
          odoo_expected_revenue?: number | null
          odoo_lead_id?: string | null
          odoo_stage?: string | null
          odoo_stage_synced_at?: string | null
          odoo_won?: boolean | null
          org_id?: string | null
          phone?: string | null
          replied_at?: string | null
          reply_text?: string | null
          smartlead_lead_id?: string | null
          source?: string | null
          synced_to_odoo?: boolean | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          plan: string | null
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          plan?: string | null
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          plan?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      sender_accounts: {
        Row: {
          created_at: string | null
          domain: string | null
          domain_verified: boolean | null
          id: string
          is_default: boolean | null
          org_id: string | null
          reply_to_email: string | null
          resend_domain_id: string | null
          sender_email: string
          sender_name: string
        }
        Insert: {
          created_at?: string | null
          domain?: string | null
          domain_verified?: boolean | null
          id?: string
          is_default?: boolean | null
          org_id?: string | null
          reply_to_email?: string | null
          resend_domain_id?: string | null
          sender_email: string
          sender_name: string
        }
        Update: {
          created_at?: string | null
          domain?: string | null
          domain_verified?: boolean | null
          id?: string
          is_default?: boolean | null
          org_id?: string | null
          reply_to_email?: string | null
          resend_domain_id?: string | null
          sender_email?: string
          sender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sender_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          steps: Json
          updated_at: string | null
          vertical_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          steps?: Json
          updated_at?: string | null
          vertical_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          steps?: Json
          updated_at?: string | null
          vertical_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_templates_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "sequence_verticals"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_verticals: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_verticals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          body: string
          campaign_id: string | null
          created_at: string | null
          delay_days: number | null
          id: string
          step: number
          subject: string
        }
        Insert: {
          body: string
          campaign_id?: string | null
          created_at?: string | null
          delay_days?: number | null
          id?: string
          step: number
          subject: string
        }
        Update: {
          body?: string
          campaign_id?: string | null
          created_at?: string | null
          delay_days?: number | null
          id?: string
          step?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          org_id: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          org_id?: string | null
          updated_at?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          org_id?: string | null
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          id: string
          leads_quota_monthly: number | null
          leads_used_this_month: number | null
          org_id: string
          plan: string | null
          quota_reset_date: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          leads_quota_monthly?: number | null
          leads_used_this_month?: number | null
          org_id: string
          plan?: string | null
          quota_reset_date?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          leads_quota_monthly?: number | null
          leads_used_this_month?: number | null
          org_id?: string
          plan?: string | null
          quota_reset_date?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          odoo_user_id: string | null
          org_id: string | null
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          odoo_user_id?: string | null
          org_id?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          odoo_user_id?: string | null
          org_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          campaign_name: string | null
          created_at: string | null
          event_type: string | null
          id: string
          lead_email: string | null
          lead_name: string | null
          org_id: string | null
          payload: Json | null
          processed: boolean | null
          source: string | null
        }
        Insert: {
          campaign_name?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: string
          lead_email?: string | null
          lead_name?: string | null
          org_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          source?: string | null
        }
        Update: {
          campaign_name?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: string
          lead_email?: string | null
          lead_name?: string | null
          org_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string }
        Returns: {
          org_id: string
          org_name: string
        }[]
      }
      current_org_id: { Args: never; Returns: string }
      get_invitation_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          is_accepted: boolean
          is_expired: boolean
          org_name: string
          role: string
        }[]
      }
      increment_leads_used: {
        Args: { p_amount: number; p_org_id: string }
        Returns: undefined
      }
      is_org_admin: { Args: never; Returns: boolean }
      is_org_owner: { Args: never; Returns: boolean }
      pending_invitation_for_current_user: {
        Args: never
        Returns: {
          org_name: string
          role: string
          token: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
