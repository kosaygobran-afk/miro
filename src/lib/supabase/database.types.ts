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
      analytics_events: {
        Row: {
          category_id: string | null;
          created_at: string;
          event_type: string;
          id: number;
          locale: string | null;
          product_id: string | null;
          results_count: number | null;
          search_query: string | null;
          session_id: string | null;
          user_id: string | null;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: never;
          locale?: string | null;
          product_id?: string | null;
          results_count?: number | null;
          search_query?: string | null;
          session_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: never;
          locale?: string | null;
          product_id?: string | null;
          results_count?: number | null;
          search_query?: string | null;
          session_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          created_at: string;
          details: Json;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      business_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
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
          image_url: string | null;
          is_active: boolean;
          name_en: string;
          name_he: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description_en?: string | null;
          description_he?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name_en: string;
          name_he: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_en?: string | null;
          description_he?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name_en?: string;
          name_he?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
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
          discount_amount: number;
          id: string;
          net_amount: number | null;
          order_id: string;
          product_id: string;
          product_name_en: string | null;
          product_name_he: string | null;
          quantity: number;
          sku_snapshot: string | null;
          total_price: number;
          unit_cost: number | null;
          unit_price: number;
          variant_id: string | null;
          vat_amount: number | null;
          vat_rate: number | null;
        };
        Insert: {
          created_at?: string;
          discount_amount?: number;
          id?: string;
          net_amount?: number | null;
          order_id: string;
          product_id: string;
          product_name_en?: string | null;
          product_name_he?: string | null;
          quantity?: number;
          sku_snapshot?: string | null;
          total_price?: number;
          unit_cost?: number | null;
          unit_price?: number;
          variant_id?: string | null;
          vat_amount?: number | null;
          vat_rate?: number | null;
        };
        Update: {
          created_at?: string;
          discount_amount?: number;
          id?: string;
          net_amount?: number | null;
          order_id?: string;
          product_id?: string;
          product_name_en?: string | null;
          product_name_he?: string | null;
          quantity?: number;
          sku_snapshot?: string | null;
          total_price?: number;
          unit_cost?: number | null;
          unit_price?: number;
          variant_id?: string | null;
          vat_amount?: number | null;
          vat_rate?: number | null;
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
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
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
          net_total: number | null;
          notes: string | null;
          order_number: string;
          payment_provider: string | null;
          payment_reference: string | null;
          shipping_address: Json;
          shipping_cost: number;
          source: string;
          status: string;
          subtotal: number;
          total: number;
          updated_at: string;
          user_id: string | null;
          vat_total: number | null;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          id?: string;
          net_total?: number | null;
          notes?: string | null;
          order_number: string;
          payment_provider?: string | null;
          payment_reference?: string | null;
          shipping_address?: Json;
          shipping_cost?: number;
          source?: string;
          status?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
          vat_total?: number | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          id?: string;
          net_total?: number | null;
          notes?: string | null;
          order_number?: string;
          payment_provider?: string | null;
          payment_reference?: string | null;
          shipping_address?: Json;
          shipping_cost?: number;
          source?: string;
          status?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
          vat_total?: number | null;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          alt_en: string | null;
          alt_he: string | null;
          created_at: string;
          id: string;
          image_url: string;
          product_id: string;
          sort_order: number;
        };
        Insert: {
          alt_en?: string | null;
          alt_he?: string | null;
          created_at?: string;
          id?: string;
          image_url: string;
          product_id: string;
          sort_order?: number;
        };
        Update: {
          alt_en?: string | null;
          alt_he?: string | null;
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
      product_serial_units: {
        Row: {
          created_at: string;
          id: string;
          lot_code: string | null;
          note: string | null;
          order_id: string | null;
          purchase_reference: string | null;
          received_at: string | null;
          serial_number: string;
          sold_at: string | null;
          state: string;
          supplier_id: string | null;
          updated_at: string;
          variant_id: string;
          warranty_until: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          lot_code?: string | null;
          note?: string | null;
          order_id?: string | null;
          purchase_reference?: string | null;
          received_at?: string | null;
          serial_number: string;
          sold_at?: string | null;
          state?: string;
          supplier_id?: string | null;
          updated_at?: string;
          variant_id: string;
          warranty_until?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          lot_code?: string | null;
          note?: string | null;
          order_id?: string | null;
          purchase_reference?: string | null;
          received_at?: string | null;
          serial_number?: string;
          sold_at?: string | null;
          state?: string;
          supplier_id?: string | null;
          updated_at?: string;
          variant_id?: string;
          warranty_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_serial_units_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_serial_units_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_serial_units_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          barcode: string | null;
          color_en: string | null;
          color_he: string | null;
          color_hex: string | null;
          cost_override: number | null;
          created_at: string;
          id: string;
          is_active: boolean;
          is_default: boolean;
          low_stock_threshold: number;
          price_override: number | null;
          product_id: string;
          reorder_point: number | null;
          reorder_qty: number | null;
          sku: string;
          stock_qty: number;
          supplier_id: string | null;
          supplier_sku: string | null;
          updated_at: string;
        };
        Insert: {
          barcode?: string | null;
          color_en?: string | null;
          color_he?: string | null;
          color_hex?: string | null;
          cost_override?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          low_stock_threshold?: number;
          price_override?: number | null;
          product_id: string;
          reorder_point?: number | null;
          reorder_qty?: number | null;
          sku: string;
          stock_qty?: number;
          supplier_id?: string | null;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          color_en?: string | null;
          color_he?: string | null;
          color_hex?: string | null;
          cost_override?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          low_stock_threshold?: number;
          price_override?: number | null;
          product_id?: string;
          reorder_point?: number | null;
          reorder_qty?: number | null;
          sku?: string;
          stock_qty?: number;
          supplier_id?: string | null;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          brand: string | null;
          category_id: string | null;
          compare_at_price: number | null;
          created_at: string;
          currency: string;
          description_en: string | null;
          description_he: string | null;
          expected_restock_date: string | null;
          id: string;
          image_url: string | null;
          inventory_count: number;
          is_active: boolean;
          is_featured: boolean;
          metadata: Json;
          model_number: string | null;
          name_en: string;
          name_he: string;
          out_of_stock_policy: string;
          price: number | null;
          purchase_cost: number | null;
          recommended_price: number | null;
          sale_price: number | null;
          seo_description_en: string | null;
          seo_description_he: string | null;
          seo_title_en: string | null;
          seo_title_he: string | null;
          short_description_en: string | null;
          short_description_he: string | null;
          slug: string;
          sort_order: number;
          specifications: Json;
          status: string;
          supplier_id: string | null;
          tags: string[];
          tracking_mode: string;
          updated_at: string;
          warranty_en: string | null;
          warranty_he: string | null;
        };
        Insert: {
          brand?: string | null;
          category_id?: string | null;
          compare_at_price?: number | null;
          created_at?: string;
          currency?: string;
          description_en?: string | null;
          description_he?: string | null;
          expected_restock_date?: string | null;
          id?: string;
          image_url?: string | null;
          inventory_count?: number;
          is_active?: boolean;
          is_featured?: boolean;
          metadata?: Json;
          model_number?: string | null;
          name_en: string;
          name_he: string;
          out_of_stock_policy?: string;
          price?: number | null;
          purchase_cost?: number | null;
          recommended_price?: number | null;
          sale_price?: number | null;
          seo_description_en?: string | null;
          seo_description_he?: string | null;
          seo_title_en?: string | null;
          seo_title_he?: string | null;
          short_description_en?: string | null;
          short_description_he?: string | null;
          slug: string;
          sort_order?: number;
          specifications?: Json;
          status?: string;
          supplier_id?: string | null;
          tags?: string[];
          tracking_mode?: string;
          updated_at?: string;
          warranty_en?: string | null;
          warranty_he?: string | null;
        };
        Update: {
          brand?: string | null;
          category_id?: string | null;
          compare_at_price?: number | null;
          created_at?: string;
          currency?: string;
          description_en?: string | null;
          description_he?: string | null;
          expected_restock_date?: string | null;
          id?: string;
          image_url?: string | null;
          inventory_count?: number;
          is_active?: boolean;
          is_featured?: boolean;
          metadata?: Json;
          model_number?: string | null;
          name_en?: string;
          name_he?: string;
          out_of_stock_policy?: string;
          price?: number | null;
          purchase_cost?: number | null;
          recommended_price?: number | null;
          sale_price?: number | null;
          seo_description_en?: string | null;
          seo_description_he?: string | null;
          seo_title_en?: string | null;
          seo_title_he?: string | null;
          short_description_en?: string | null;
          short_description_he?: string | null;
          slug?: string;
          sort_order?: number;
          specifications?: Json;
          status?: string;
          supplier_id?: string | null;
          tags?: string[];
          tracking_mode?: string;
          updated_at?: string;
          warranty_en?: string | null;
          warranty_he?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
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
      stock_movements: {
        Row: {
          actor_id: string | null;
          created_at: string;
          delta: number;
          id: string;
          note: string | null;
          previous_qty: number;
          reference: string | null;
          resulting_qty: number;
          type: string;
          unit_cost: number | null;
          variant_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          delta: number;
          id?: string;
          note?: string | null;
          previous_qty: number;
          reference?: string | null;
          resulting_qty: number;
          type: string;
          unit_cost?: number | null;
          variant_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          delta?: number;
          id?: string;
          note?: string | null;
          previous_qty?: number;
          reference?: string | null;
          resulting_qty?: number;
          type?: string;
          unit_cost?: number | null;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          company_name: string;
          contact_person: string | null;
          created_at: string;
          currency: string;
          default_lead_time_days: number | null;
          email: string | null;
          id: string;
          is_active: boolean;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          company_name: string;
          contact_person?: string | null;
          created_at?: string;
          currency?: string;
          default_lead_time_days?: number | null;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          company_name?: string;
          contact_person?: string | null;
          created_at?: string;
          currency?: string;
          default_lead_time_days?: number | null;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tax_rates: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          rate: number;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          rate: number;
          valid_from: string;
          valid_until?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          rate?: number;
          valid_from?: string;
          valid_until?: string | null;
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
      v_product_daily_metrics: {
        Row: {
          day: string | null;
          event_type: string | null;
          events: number | null;
          product_id: string | null;
          unique_sessions: number | null;
          unique_users: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      active_app_role: { Args: never; Returns: string };
      add_ceo: { Args: { account_email: string }; Returns: undefined };
      adjust_stock: {
        Args: { p_counted: number; p_reason: string; p_variant_id: string };
        Returns: string;
      };
      assign_customer_role: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      current_tax_rate: { Args: never; Returns: number };
      delete_own_ceo_account: { Args: never; Returns: undefined };
      delete_user_account: { Args: { target: string }; Returns: undefined };
      manage_account: {
        Args: { new_role?: string; new_status?: string; target: string };
        Returns: undefined;
      };
      publish_product: { Args: { p_product: string }; Returns: undefined };
      record_sale: {
        Args: { p_customer: Json; p_items: Json };
        Returns: string;
      };
      record_stock_movement: {
        Args: {
          p_delta: number;
          p_note?: string;
          p_reference?: string;
          p_type: string;
          p_unit_cost?: number;
          p_variant_id: string;
        };
        Returns: string;
      };
      require_recent_ceo_password: { Args: never; Returns: undefined };
      set_business_setting: {
        Args: { p_key: string; p_value: Json };
        Returns: undefined;
      };
      set_default_variant: { Args: { p_variant: string }; Returns: undefined };
      set_tax_rate: {
        Args: { p_name: string; p_rate: number; p_valid_from: string };
        Returns: string;
      };
      unpublish_product: {
        Args: { p_product: string; p_status?: string };
        Returns: undefined;
      };
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
