export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string;
          created_at: string;
          details: Json;
          id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          cart_id: string;
          created_at: string;
          id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          cart_id: string;
          created_at?: string;
          id?: string;
          product_id: string;
          quantity?: number;
        };
        Update: {
          cart_id?: string;
          created_at?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      carts: {
        Row: {
          created_at: string;
          id: string;
          session_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          session_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          session_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          description_en: string | null;
          description_he: string | null;
          id: string;
          name_en: string;
          name_he: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description_en?: string | null;
          description_he?: string | null;
          id?: string;
          name_en: string;
          name_he: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description_en?: string | null;
          description_he?: string | null;
          id?: string;
          name_en?: string;
          name_he?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          invoice_number: string;
          issued_at: string | null;
          order_id: string | null;
          status: string;
          subtotal: number;
          total: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          invoice_number: string;
          issued_at?: string | null;
          order_id?: string | null;
          status?: string;
          subtotal?: number;
          total?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          invoice_number?: string;
          issued_at?: string | null;
          order_id?: string | null;
          status?: string;
          subtotal?: number;
          total?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          total_price: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          order_id: string;
          product_id: string;
          quantity?: number;
          total_price?: number;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          total_price?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          created_at: string;
          currency: string;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          id: string;
          notes: string | null;
          order_number: string;
          payment_provider: string | null;
          payment_reference: string | null;
          shipping_address: Json;
          shipping_cost: number;
          status: string;
          subtotal: number;
          total: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          id?: string;
          notes?: string | null;
          order_number: string;
          payment_provider?: string | null;
          payment_reference?: string | null;
          shipping_address?: Json;
          shipping_cost?: number;
          status?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_provider?: string | null;
          payment_reference?: string | null;
          shipping_address?: Json;
          shipping_cost?: number;
          status?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          created_at: string;
          id: string;
          image_url: string;
          product_id: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_url: string;
          product_id: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_url?: string;
          product_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_prices: {
        Row: {
          price: number;
          product_id: string;
          role: string;
        };
        Insert: {
          price: number;
          product_id: string;
          role: string;
        };
        Update: {
          price?: number;
          product_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          category_id: string | null;
          compare_at_price: number | null;
          created_at: string;
          description_en: string | null;
          description_he: string | null;
          id: string;
          image_url: string | null;
          inventory_count: number;
          is_active: boolean;
          is_featured: boolean;
          metadata: Json;
          name_en: string;
          name_he: string;
          price: number;
          short_description_en: string | null;
          short_description_he: string | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          compare_at_price?: number | null;
          created_at?: string;
          description_en?: string | null;
          description_he?: string | null;
          id?: string;
          image_url?: string | null;
          inventory_count?: number;
          is_active?: boolean;
          is_featured?: boolean;
          metadata?: Json;
          name_en: string;
          name_he: string;
          price?: number;
          short_description_en?: string | null;
          short_description_he?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          compare_at_price?: number | null;
          created_at?: string;
          description_en?: string | null;
          description_he?: string | null;
          id?: string;
          image_url?: string | null;
          inventory_count?: number;
          is_active?: boolean;
          is_featured?: boolean;
          metadata?: Json;
          name_en?: string;
          name_he?: string;
          price?: number;
          short_description_en?: string | null;
          short_description_he?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          account_status: string;
          created_at: string;
          display_name: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          role: string;
          suspended_at: string | null;
          suspended_reason: string | null;
          updated_at: string;
        };
        Insert: {
          account_status?: string;
          created_at?: string;
          display_name?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role?: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          account_status?: string;
          created_at?: string;
          display_name?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role?: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_products: {
        Row: {
          created_at: string;
          product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      service_requests: {
        Row: {
          assigned_worker_id: string | null;
          created_at: string;
          customer_id: string | null;
          email: string;
          id: string;
          message: string;
          name: string;
          phone: string | null;
          service_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          assigned_worker_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          email: string;
          id?: string;
          message: string;
          name: string;
          phone?: string | null;
          service_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assigned_worker_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          email?: string;
          id?: string;
          message?: string;
          name?: string;
          phone?: string | null;
          service_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      active_app_role: { Args: never; Returns: string };
      add_ceo: { Args: { account_email: string }; Returns: undefined };
      assign_customer_role: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      delete_own_ceo_account: { Args: never; Returns: undefined };
      manage_account: {
        Args: { new_role?: string; new_status?: string; target: string };
        Returns: undefined;
      };
      require_recent_ceo_password: { Args: never; Returns: undefined };
      update_service_request: {
        Args: { new_status: string; target: string; worker?: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
