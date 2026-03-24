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
      ai_usage_log: {
        Row: {
          created_at: string
          function_name: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      design_feedback: {
        Row: {
          created_at: string
          id: string
          message_id: string | null
          notes: string | null
          organization_id: string
          rating: string
          reference_image_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: string | null
          notes?: string | null
          organization_id: string
          rating: string
          reference_image_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string | null
          notes?: string | null
          organization_id?: string
          rating?: string
          reference_image_url?: string | null
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
      design_history: {
        Row: {
          created_at: string
          design_url: string
          feedback_notes: string | null
          id: string
          message_id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          design_url: string
          feedback_notes?: string | null
          id?: string
          message_id: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          design_url?: string
          feedback_notes?: string | null
          id?: string
          message_id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ebay_connections: {
        Row: {
          access_token: string | null
          client_id: string
          client_secret: string
          created_at: string
          environment: string
          id: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          client_id?: string
          client_secret?: string
          created_at?: string
          environment?: string
          id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          client_id?: string
          client_secret?: string
          created_at?: string
          environment?: string
          id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      etsy_connections: {
        Row: {
          access_token: string | null
          api_key: string
          created_at: string
          id: string
          refresh_token: string | null
          shop_id: string
          shop_name: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          api_key?: string
          created_at?: string
          id?: string
          refresh_token?: string | null
          shop_id?: string
          shop_name?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          api_key?: string
          created_at?: string
          id?: string
          refresh_token?: string | null
          shop_id?: string
          shop_name?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_messages: {
        Row: {
          created_at: string
          dark_design_url: string | null
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
          dark_design_url?: string | null
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
          dark_design_url?: string | null
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
      meta_connections: {
        Row: {
          access_token: string
          catalog_id: string
          created_at: string
          id: string
          page_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string
          catalog_id?: string
          created_at?: string
          id?: string
          page_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          catalog_id?: string
          created_at?: string
          id?: string
          page_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          deleted_at: string | null
          design_styles: Json
          enabled_marketplaces: string[]
          id: string
          logo_url: string | null
          name: string
          niche: string
          printify_api_token: string | null
          printify_shop_id: number | null
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
          deleted_at?: string | null
          design_styles?: Json
          enabled_marketplaces?: string[]
          id?: string
          logo_url?: string | null
          name: string
          niche?: string
          printify_api_token?: string | null
          printify_shop_id?: number | null
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
          deleted_at?: string | null
          design_styles?: Json
          enabled_marketplaces?: string[]
          id?: string
          logo_url?: string | null
          name?: string
          niche?: string
          printify_api_token?: string | null
          printify_shop_id?: number | null
          template_image_url?: string | null
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_job_items: {
        Row: {
          created_at: string
          design_file_name: string
          design_url: string | null
          error: string | null
          folder_name: string
          id: string
          item_index: number
          job_id: string
          mockup_file_names: Json
          mockup_uploads: Json | null
          product_id: string | null
          product_title: string | null
          status: string
          step: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          design_file_name?: string
          design_url?: string | null
          error?: string | null
          folder_name: string
          id?: string
          item_index?: number
          job_id: string
          mockup_file_names?: Json
          mockup_uploads?: Json | null
          product_id?: string | null
          product_title?: string | null
          status?: string
          step?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          design_file_name?: string
          design_url?: string | null
          error?: string | null
          folder_name?: string
          id?: string
          item_index?: number
          job_id?: string
          mockup_file_names?: Json
          mockup_uploads?: Json | null
          product_id?: string | null
          product_title?: string | null
          status?: string
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_jobs: {
        Row: {
          completed_items: number
          concurrency: number
          created_at: string
          failed_items: number
          id: string
          organization_id: string
          push_to_shopify: boolean
          status: string
          total_items: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_items?: number
          concurrency?: number
          created_at?: string
          failed_items?: number
          id?: string
          organization_id: string
          push_to_shopify?: boolean
          status?: string
          total_items?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_items?: number
          concurrency?: number
          created_at?: string
          failed_items?: number
          id?: string
          organization_id?: string
          push_to_shopify?: boolean
          status?: string
          total_items?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          ebay_listing_id: string | null
          etsy_listing_id: string | null
          features: string
          id: string
          image_url: string | null
          keywords: string
          meta_listing_id: string | null
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
          ebay_listing_id?: string | null
          etsy_listing_id?: string | null
          features?: string
          id?: string
          image_url?: string | null
          keywords?: string
          meta_listing_id?: string | null
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
          ebay_listing_id?: string | null
          etsy_listing_id?: string | null
          features?: string
          id?: string
          image_url?: string | null
          keywords?: string
          meta_listing_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          store_domain?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          caption: string
          created_at: string
          hashtags: Json
          id: string
          image_url: string | null
          organization_id: string
          platform: string
          product_id: string
          scheduled_date: string | null
          user_id: string
        }
        Insert: {
          caption?: string
          created_at?: string
          hashtags?: Json
          id?: string
          image_url?: string | null
          organization_id: string
          platform: string
          product_id: string
          scheduled_date?: string | null
          user_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          hashtags?: Json
          id?: string
          image_url?: string | null
          organization_id?: string
          platform?: string
          product_id?: string
          scheduled_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          credits: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          credits?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          credits?: number
          id?: string
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
