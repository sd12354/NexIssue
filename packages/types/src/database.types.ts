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
      advisor_runs: {
        Row: {
          context_snapshot: Json
          created_at: string
          id: string
          org_id: string
          recommendations: Json
          run_at: string
          updated_at: string
        }
        Insert: {
          context_snapshot?: Json
          created_at?: string
          id?: string
          org_id: string
          recommendations?: Json
          run_at?: string
          updated_at?: string
        }
        Update: {
          context_snapshot?: Json
          created_at?: string
          id?: string
          org_id?: string
          recommendations?: Json
          run_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comics: {
        Row: {
          acquired_at: string | null
          acquired_cost: number | null
          acquired_source: string | null
          cert_number: string
          created_at: string
          created_by: string | null
          encapsulation_date: string | null
          grade: number | null
          grader: string
          id: string
          issue: string | null
          key_notes: string[]
          org_id: string
          status: Database["public"]["Enums"]["comic_status"]
          title: string | null
          updated_at: string
          variant: string | null
          year: number | null
        }
        Insert: {
          acquired_at?: string | null
          acquired_cost?: number | null
          acquired_source?: string | null
          cert_number: string
          created_at?: string
          created_by?: string | null
          encapsulation_date?: string | null
          grade?: number | null
          grader: string
          id?: string
          issue?: string | null
          key_notes?: string[]
          org_id: string
          status?: Database["public"]["Enums"]["comic_status"]
          title?: string | null
          updated_at?: string
          variant?: string | null
          year?: number | null
        }
        Update: {
          acquired_at?: string | null
          acquired_cost?: number | null
          acquired_source?: string | null
          cert_number?: string
          created_at?: string
          created_by?: string | null
          encapsulation_date?: string | null
          grade?: number | null
          grader?: string
          id?: string
          issue?: string | null
          key_notes?: string[]
          org_id?: string
          status?: Database["public"]["Enums"]["comic_status"]
          title?: string | null
          updated_at?: string
          variant?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_rules: {
        Row: {
          action: string
          active: boolean
          conditions: Json
          created_at: string
          id: string
          name: string
          org_id: string
          price_formula: string | null
          priority: number
          updated_at: string
        }
        Insert: {
          action: string
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          org_id: string
          price_formula?: string | null
          priority?: number
          updated_at?: string
        }
        Update: {
          action?: string
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          price_formula?: string | null
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          asking_price: number | null
          comic_id: string
          created_at: string
          description: string | null
          id: string
          marketplace: string
          marketplace_listing_id: string | null
          org_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          asking_price?: number | null
          comic_id: string
          created_at?: string
          description?: string | null
          id?: string
          marketplace?: string
          marketplace_listing_id?: string | null
          org_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          asking_price?: number | null
          comic_id?: string
          created_at?: string
          description?: string | null
          id?: string
          marketplace?: string
          marketplace_listing_id?: string | null
          org_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_comic_id_fkey"
            columns: ["comic_id"]
            isOneToOne: false
            referencedRelation: "comics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_integrations: {
        Row: {
          connected_at: string
          created_at: string
          credentials: Json
          id: string
          last_used_at: string | null
          metadata: Json
          org_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          updated_at: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          credentials?: Json
          id?: string
          last_used_at?: string | null
          metadata?: Json
          org_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          updated_at?: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          credentials?: Json
          id?: string
          last_used_at?: string | null
          metadata?: Json
          org_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          org_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          return_scheme: string | null
          state: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          org_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          return_scheme?: string | null
          state: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          org_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          return_scheme?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          shipping_from: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          shipping_from?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          shipping_from?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_shipping_presets: {
        Row: {
          created_at: string
          distance_unit: string
          height: number
          id: string
          is_default: boolean
          length: number
          mass_unit: string
          name: string
          org_id: string
          weight: number
          width: number
        }
        Insert: {
          created_at?: string
          distance_unit?: string
          height: number
          id?: string
          is_default?: boolean
          length: number
          mass_unit?: string
          name: string
          org_id: string
          weight: number
          width: number
        }
        Update: {
          created_at?: string
          distance_unit?: string
          height?: number
          id?: string
          is_default?: boolean
          length?: number
          mass_unit?: string
          name?: string
          org_id?: string
          weight?: number
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_shipping_presets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          expo_push_token: string
          id: string
          org_id: string
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          id?: string
          org_id: string
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          id?: string
          org_id?: string
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          comic_id: string
          created_at: string
          id: string
          org_id: string
          position: string
          storage_path: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          comic_id: string
          created_at?: string
          id?: string
          org_id: string
          position: string
          storage_path: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          comic_id?: string
          created_at?: string
          id?: string
          org_id?: string
          position?: string
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_comic_id_fkey"
            columns: ["comic_id"]
            isOneToOne: false
            referencedRelation: "comics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          comic_id: string
          created_at: string
          fetched_at: string
          grade_matched: boolean | null
          id: string
          metadata: Json
          org_id: string
          price: number
          sale_date: string | null
          source: string
          updated_at: string
        }
        Insert: {
          comic_id: string
          created_at?: string
          fetched_at?: string
          grade_matched?: boolean | null
          id?: string
          metadata?: Json
          org_id: string
          price: number
          sale_date?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          comic_id?: string
          created_at?: string
          fetched_at?: string
          grade_matched?: boolean | null
          id?: string
          metadata?: Json
          org_id?: string
          price?: number
          sale_date?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_comic_id_fkey"
            columns: ["comic_id"]
            isOneToOne: false
            referencedRelation: "comics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          buyer_address: Json | null
          buyer_id_external: string | null
          buyer_username: string | null
          created_at: string
          delivered_at: string | null
          estimated_delivery: string | null
          id: string
          label_storage_path: string | null
          listing_id: string
          org_id: string
          shipped_at: string | null
          shippo_label_cost: number | null
          shippo_label_id: string | null
          sold_at: string
          sold_price: number
          status: string
          tracking_number: string | null
          tracking_status: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          buyer_address?: Json | null
          buyer_id_external?: string | null
          buyer_username?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          label_storage_path?: string | null
          listing_id: string
          org_id: string
          shipped_at?: string | null
          shippo_label_cost?: number | null
          shippo_label_id?: string | null
          sold_at?: string
          sold_price: number
          status?: string
          tracking_number?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          buyer_address?: Json | null
          buyer_id_external?: string | null
          buyer_username?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          label_storage_path?: string | null
          listing_id?: string
          org_id?: string
          shipped_at?: string | null
          shippo_label_cost?: number | null
          shippo_label_id?: string | null
          sold_at?: string
          sold_price?: number
          status?: string
          tracking_number?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          last_seen_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          last_seen_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_seen_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
    }
    Enums: {
      comic_status: "in_inventory" | "listed" | "sold" | "gifted"
      integration_provider: "ebay" | "shippo" | "gocollect"
      listing_status:
        | "draft"
        | "pending_review"
        | "published"
        | "sold"
        | "ended"
      org_member_role: "owner" | "admin" | "helper"
      plan_tier: "free" | "pro" | "dealer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      comic_status: ["in_inventory", "listed", "sold", "gifted"],
      integration_provider: ["ebay", "shippo", "gocollect"],
      listing_status: ["draft", "pending_review", "published", "sold", "ended"],
      org_member_role: ["owner", "admin", "helper"],
      plan_tier: ["free", "pro", "dealer"],
    },
  },
} as const
