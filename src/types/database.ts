export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          created_at: string
          created_by: string | null
          retention_days: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          created_by?: string | null
          retention_days?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          created_by?: string | null
          retention_days?: number | null
        }
      }
      conversation_members: {
        Row: {
          conversation_id: string
          user_id: string
          joined_at: string
          status: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          joined_at?: string
          status?: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
          joined_at?: string
          status?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          body: string
          client_message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          body: string
          client_message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          body?: string
          client_message_id?: string | null
          created_at?: string
        }
      }
      invitations: {
        Row: {
          id: string
          token_hash: string
          invited_email: string | null
          created_by: string
          expires_at: string
          accepted_at: string | null
          revoked_at: string | null
        }
        Insert: {
          id?: string
          token_hash: string
          invited_email?: string | null
          created_by: string
          expires_at: string
          accepted_at?: string | null
          revoked_at?: string | null
        }
        Update: {
          id?: string
          token_hash?: string
          invited_email?: string | null
          created_by?: string
          expires_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
        }
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
  }
}