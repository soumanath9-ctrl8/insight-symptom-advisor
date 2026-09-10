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
      patient_profiles: {
        Row: {
          age: string | null
          allergies: string | null
          created_at: string
          current_medications: string | null
          existing_conditions: string | null
          family_history: string | null
          id: string
          name: string
          owner_user_id: string
          pregnancy_status: string | null
          previous_major_illnesses: string | null
          sex: string | null
          smoking_status: string | null
          updated_at: string
        }
        Insert: {
          age?: string | null
          allergies?: string | null
          created_at?: string
          current_medications?: string | null
          existing_conditions?: string | null
          family_history?: string | null
          id?: string
          name?: string
          owner_user_id: string
          pregnancy_status?: string | null
          previous_major_illnesses?: string | null
          sex?: string | null
          smoking_status?: string | null
          updated_at?: string
        }
        Update: {
          age?: string | null
          allergies?: string | null
          created_at?: string
          current_medications?: string | null
          existing_conditions?: string | null
          family_history?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          pregnancy_status?: string | null
          previous_major_illnesses?: string | null
          sex?: string | null
          smoking_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: string | null
          allergies: string | null
          created_at: string
          current_medications: string | null
          existing_conditions: string | null
          family_history: string | null
          id: string
          name: string
          pregnancy_status: string | null
          previous_major_illnesses: string | null
          sex: string | null
          smoking_status: string | null
          updated_at: string
        }
        Insert: {
          age?: string | null
          allergies?: string | null
          created_at?: string
          current_medications?: string | null
          existing_conditions?: string | null
          family_history?: string | null
          id: string
          name?: string
          pregnancy_status?: string | null
          previous_major_illnesses?: string | null
          sex?: string | null
          smoking_status?: string | null
          updated_at?: string
        }
        Update: {
          age?: string | null
          allergies?: string | null
          created_at?: string
          current_medications?: string | null
          existing_conditions?: string | null
          family_history?: string | null
          id?: string
          name?: string
          pregnancy_status?: string | null
          previous_major_illnesses?: string | null
          sex?: string | null
          smoking_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      symptom_checks: {
        Row: {
          answers: Json
          categories: Json
          created_at: string
          id: string
          next_step: string
          patient_id: string | null
          red_flag: boolean
          red_flags: Json
          severity: number
          subject_type: string
          summary: string
          supporting_factors: Json
          symptoms: string
          top_condition: string
          uncertainty: string
          urgency: string
          user_id: string
          vitals: Json
        }
        Insert: {
          answers?: Json
          categories?: Json
          created_at?: string
          id?: string
          next_step?: string
          patient_id?: string | null
          red_flag?: boolean
          red_flags?: Json
          severity?: number
          subject_type?: string
          summary?: string
          supporting_factors?: Json
          symptoms: string
          top_condition?: string
          uncertainty?: string
          urgency: string
          user_id: string
          vitals?: Json
        }
        Update: {
          answers?: Json
          categories?: Json
          created_at?: string
          id?: string
          next_step?: string
          patient_id?: string | null
          red_flag?: boolean
          red_flags?: Json
          severity?: number
          subject_type?: string
          summary?: string
          supporting_factors?: Json
          symptoms?: string
          top_condition?: string
          uncertainty?: string
          urgency?: string
          user_id?: string
          vitals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "symptom_checks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
