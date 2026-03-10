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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      design_feedback: {
        Row: {
          created_at: string
          id: string
          message_id: string | null
          notes: string | null
          organization_id: string
          rating: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: string | null
          notes?: string | null
          organization_id: string
          rating: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string | null
          notes?: string | null
          organization_id?: string
          rating?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "generated_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_messages: {
        Row: {
          created_at: string
          design_url: string | null
          id: string
          is_selected: boolean
          message_text: string
          organization_id: string
          product_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          design_url?: string | null
          id?: string
          is_selected?: boolean
          message_text: string
          organization_id: string
          product_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          design_url?: string | null
          id?: string
          is_selected?: boolean
          message_text?: string
          organization_id?: string
          product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          alt_text: string
          bullet_points: Json
          created_at: string
          description: string
          id: string
          marketplace: string
          product_id: string
          seo_description: string
          seo_title: string
          tags: Json
          title: string
          url_handle: string
          user_id: string
        }
        Insert: {
          alt_text?: string
          bullet_points?: Json
          created_at?: string
          description?: string
          id?: string
          marketplace: string
          product_id: string
          seo_description?: string
          seo_title?: string
          tags?: Json
          title: string
          url_handle?: string
          user_id: string
        }
        Update: {
          alt_text?: string
          bullet_points?: Json
          created_at?: string
          description?: string
          id?: string
          marketplace?: string
          product_id?: string
          seo_description?: string
          seo_title?: string
          tags?: Json
          title?: string
          url_handle?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invite_token: string
          invited_by: string
          invited_email: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_token?: string
          invited_by: string
          invited_email?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_token?: string
          invited_by?: string
          invited_email?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          audience: string
          brand_color: string
          brand_font: string
          brand_font_size: string
          brand_style_notes: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          niche: string
          template_image_url: string | null
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience?: string
          brand_color?: string
          brand_font?: string
          brand_font_size?: string
          brand_style_notes?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          niche?: string
          template_image_url?: string | null
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience?: string
          brand_color?: string
          brand_font?: string
          brand_font_size?: string
          brand_style_notes?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          niche?: string
          template_image_url?: string | null
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          color_name: string
          created_at: string
          id: string
          image_type: string
          image_url: string
          position: number
          product_id: string
          user_id: string
        }
        Insert: {
          color_name?: string
          created_at?: string
          id?: string
          image_type?: string
          image_url: string
          position?: number
          product_id: string
          user_id: string
        }
        Update: {
          color_name?: string
          created_at?: string
          id?: string
          image_type?: string
          image_url?: string
          position?: number
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          description: string
          features: string
          id: string
          image_url: string | null
          keywords: string
          organization_id: string
          price: string
          printify_product_id: string | null
          shopify_product_id: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          features?: string
          id?: string
          image_url?: string | null
          keywords?: string
          organization_id: string
          price?: string
          printify_product_id?: string | null
          shopify_product_id?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          features?: string
          id?: string
          image_url?: string | null
          keywords?: string
          organization_id?: string
          price?: string
          printify_product_id?: string | null
          shopify_product_id?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_connections: {
        Row: {
          access_token: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          id: string
          store_domain: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          store_domain: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          store_domain?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      org_role: "owner" | "editor" | "viewer"
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
      org_role: ["owner", "editor", "viewer"],
    },
  },
} as const
