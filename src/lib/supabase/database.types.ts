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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      app_meta: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          group_id: string | null
          id: string
          person_id: string | null
          requested_at: string
          requested_role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["application_status"]
          user_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string | null
          id?: string
          person_id?: string | null
          requested_at?: string
          requested_role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["application_status"]
          user_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string | null
          id?: string
          person_id?: string | null
          requested_at?: string
          requested_role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["application_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_quota_holds: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          month: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          month: string
          user_id: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_quota_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_quota_months: {
        Row: {
          bonus: number
          month: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          bonus?: number
          month: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          bonus?: number
          month?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_quota_months_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_quota_requests: {
        Row: {
          amount: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          month: string
          reason: string | null
          status: Database["public"]["Enums"]["chat_request_status"]
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          month: string
          reason?: string | null
          status: Database["public"]["Enums"]["chat_request_status"]
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          month?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["chat_request_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_quota_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_quota_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          report_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          report_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          group_id: string | null
          id: number
          is_late: boolean | null
          occurred_at: string
          person_id: string | null
          report_id: string | null
          type: Database["public"]["Enums"]["event_type"]
          user_id: string | null
          week_key: string | null
        }
        Insert: {
          group_id?: string | null
          id?: never
          is_late?: boolean | null
          occurred_at?: string
          person_id?: string | null
          report_id?: string | null
          type: Database["public"]["Enums"]["event_type"]
          user_id?: string | null
          week_key?: string | null
        }
        Update: {
          group_id?: string | null
          id?: never
          is_late?: boolean | null
          occurred_at?: string
          person_id?: string | null
          report_id?: string | null
          type?: Database["public"]["Enums"]["event_type"]
          user_id?: string | null
          week_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      export_logs: {
        Row: {
          created_at: string
          format: Database["public"]["Enums"]["export_format"]
          group_ids: string[] | null
          id: number
          range_end: string | null
          range_start: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          format: Database["public"]["Enums"]["export_format"]
          group_ids?: string[] | null
          id?: never
          range_end?: string | null
          range_start?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          format?: Database["public"]["Enums"]["export_format"]
          group_ids?: string[] | null
          id?: never
          range_end?: string | null
          range_start?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_moves: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          direction: string
          from_group_id: string
          id: string
          note: string | null
          person_id: string
          requested_at: string
          requested_by: string | null
          status: Database["public"]["Enums"]["group_move_status"]
          to_group_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          direction?: string
          from_group_id: string
          id?: string
          note?: string | null
          person_id: string
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["group_move_status"]
          to_group_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          direction?: string
          from_group_id?: string
          id?: string
          note?: string | null
          person_id?: string
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["group_move_status"]
          to_group_id?: string
        }
        Relationships: []
      }
      group_profiles: {
        Row: {
          created_at: string
          ddays: Json
          free_text: string | null
          group_id: string
          intro: string | null
          theme: Json
          theme_songs: Json
          updated_at: string
          updated_by: string | null
          verse: string | null
        }
        Insert: {
          created_at?: string
          ddays?: Json
          free_text?: string | null
          group_id: string
          intro?: string | null
          theme?: Json
          theme_songs?: Json
          updated_at?: string
          updated_by?: string | null
          verse?: string | null
        }
        Update: {
          created_at?: string
          ddays?: Json
          free_text?: string | null
          group_id?: string
          intro?: string | null
          theme?: Json
          theme_songs?: Json
          updated_at?: string
          updated_by?: string | null
          verse?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          number: number
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
          village: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          number: number
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
          village?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          number?: number
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
          village?: string | null
        }
        Relationships: []
      }
      ministries: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      pastor_digest_feedback: {
        Row: {
          helpful: boolean | null
          item_key: string
          updated_at: string
          user_id: string
          week_key: string
          wrong: boolean
        }
        Insert: {
          helpful?: boolean | null
          item_key: string
          updated_at?: string
          user_id?: string
          week_key: string
          wrong?: boolean
        }
        Update: {
          helpful?: boolean | null
          item_key?: string
          updated_at?: string
          user_id?: string
          week_key?: string
          wrong?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pastor_digest_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastor_digest_feedback_week_key_fkey"
            columns: ["week_key"]
            isOneToOne: false
            referencedRelation: "pastor_digests"
            referencedColumns: ["week_key"]
          },
        ]
      }
      pastor_digests: {
        Row: {
          content: Json | null
          created_at: string
          created_by: string | null
          fail_reason: string | null
          generated_at: string | null
          group_count: number | null
          input_tokens: number | null
          model: string | null
          ms: number | null
          output_tokens: number | null
          regen_count: number
          report_count: number | null
          status: string
          updated_at: string
          week_key: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          created_by?: string | null
          fail_reason?: string | null
          generated_at?: string | null
          group_count?: number | null
          input_tokens?: number | null
          model?: string | null
          ms?: number | null
          output_tokens?: number | null
          regen_count?: number
          report_count?: number | null
          status?: string
          updated_at?: string
          week_key: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          created_by?: string | null
          fail_reason?: string | null
          generated_at?: string | null
          group_count?: number | null
          input_tokens?: number | null
          model?: string | null
          ms?: number | null
          output_tokens?: number | null
          regen_count?: number
          report_count?: number | null
          status?: string
          updated_at?: string
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastor_digests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      person_ministries: {
        Row: {
          created_at: string
          ministry_id: string
          person_id: string
        }
        Insert: {
          created_at?: string
          ministry_id: string
          person_id: string
        }
        Update: {
          created_at?: string
          ministry_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_ministries_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_ministries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_ministries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_public"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          affiliation: string | null
          ai_consented_at: string | null
          ai_excluded: boolean
          assembly_member: boolean
          attendance_off: string | null
          birth_date: string | null
          birth_year: number | null
          campus: string | null
          care_status: Database["public"]["Enums"]["care_status"]
          created_at: string
          dormancy_request: Database["public"]["Enums"]["dormancy_request_status"]
          gender: Database["public"]["Enums"]["gender"] | null
          group_since: string | null
          group_id: string | null
          group_role: Database["public"]["Enums"]["group_role"]
          id: string
          is_group_head: boolean
          joined_at: string
          left_at: string | null
          name: string
          needs_check: boolean | null
          note: string | null
          occupation: string | null
          phone: string | null
          report_hidden: boolean
          report_order: number | null
          status: Database["public"]["Enums"]["person_status"]
          training_stage: string | null
          updated_at: string
          user_id: string | null
          youth_member: boolean
        }
        Insert: {
          affiliation?: string | null
          ai_consented_at?: string | null
          ai_excluded?: boolean
          assembly_member?: boolean
          attendance_off?: string | null
          birth_date?: string | null
          birth_year?: number | null
          campus?: string | null
          care_status?: Database["public"]["Enums"]["care_status"]
          created_at?: string
          dormancy_request?: Database["public"]["Enums"]["dormancy_request_status"]
          gender?: Database["public"]["Enums"]["gender"] | null
          group_since?: string | null
          group_id?: string | null
          group_role?: Database["public"]["Enums"]["group_role"]
          id?: string
          is_group_head?: boolean
          joined_at: string
          left_at?: string | null
          name: string
          needs_check?: boolean | null
          note?: string | null
          occupation?: string | null
          phone?: string | null
          report_hidden?: boolean
          report_order?: number | null
          status?: Database["public"]["Enums"]["person_status"]
          training_stage?: string | null
          updated_at?: string
          user_id?: string | null
          youth_member?: boolean
        }
        Update: {
          affiliation?: string | null
          ai_consented_at?: string | null
          ai_excluded?: boolean
          assembly_member?: boolean
          attendance_off?: string | null
          birth_date?: string | null
          birth_year?: number | null
          campus?: string | null
          care_status?: Database["public"]["Enums"]["care_status"]
          created_at?: string
          dormancy_request?: Database["public"]["Enums"]["dormancy_request_status"]
          gender?: Database["public"]["Enums"]["gender"] | null
          group_since?: string | null
          group_id?: string | null
          group_role?: Database["public"]["Enums"]["group_role"]
          id?: string
          is_group_head?: boolean
          joined_at?: string
          left_at?: string | null
          name?: string
          needs_check?: boolean | null
          note?: string | null
          occupation?: string | null
          phone?: string | null
          report_hidden?: boolean
          report_order?: number | null
          status?: Database["public"]["Enums"]["person_status"]
          training_stage?: string | null
          updated_at?: string
          user_id?: string | null
          youth_member?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "persons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photos: {
        Row: {
          image: string
          updated_at: string
          user_id: string
        }
        Insert: {
          image: string
          updated_at?: string
          user_id: string
        }
        Update: {
          image?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_log: {
        Row: {
          created_at: string
          dedupe_key: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          id?: never
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_presence: {
        Row: {
          report_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          report_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          report_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_presence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_reviews: {
        Row: {
          first_read_at: string
          last_read_at: string
          note: string | null
          note_at: string | null
          read_count: number
          report_id: string
          reviewer_id: string
          stamp: Database["public"]["Enums"]["report_stamp"] | null
          stamped_at: string | null
        }
        Insert: {
          first_read_at?: string
          last_read_at?: string
          note?: string | null
          note_at?: string | null
          read_count?: number
          report_id: string
          reviewer_id: string
          stamp?: Database["public"]["Enums"]["report_stamp"] | null
          stamped_at?: string | null
        }
        Update: {
          first_read_at?: string
          last_read_at?: string
          note?: string | null
          note_at?: string | null
          read_count?: number
          report_id?: string
          reviewer_id?: string
          stamp?: Database["public"]["Enums"]["report_stamp"] | null
          stamped_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_reviews_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_late: boolean
          no_meeting: boolean
          note: string | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          week_key: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_late?: boolean
          no_meeting?: boolean
          note?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          week_key: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_late?: boolean
          no_meeting?: boolean
          note?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      skipped_weeks: {
        Row: {
          created_at: string
          created_by: string | null
          reason: string | null
          week_key: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          reason?: string | null
          week_key: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          reason?: string | null
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "skipped_weeks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          bio: string | null
          interests: string[]
          updated_at: string
          user_id: string
          verse: string | null
        }
        Insert: {
          bio?: string | null
          interests?: string[]
          updated_at?: string
          user_id: string
          verse?: string | null
        }
        Update: {
          bio?: string | null
          interests?: string[]
          updated_at?: string
          user_id?: string
          verse?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string | null
          id: string
          is_officer: boolean
          name: string
          provider: Database["public"]["Enums"]["auth_provider"] | null
          provider_uid: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          terms_agreed_at: string | null
          terms_version: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_officer?: boolean
          name: string
          provider?: Database["public"]["Enums"]["auth_provider"] | null
          provider_uid?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          terms_agreed_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_officer?: boolean
          name?: string
          provider?: Database["public"]["Enums"]["auth_provider"] | null
          provider_uid?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          terms_agreed_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      weekly_records: {
        Row: {
          absent_reason: string | null
          author_id: string
          created_at: string
          group_id_at_write: string
          group_meeting_attended: boolean
          id: string
          meeting_absent_reason: string | null
          note: string | null
          one_on_one_contacted: boolean
          online_reason: string | null
          person_id: string
          prayer_request: string | null
          prayer_status: Database["public"]["Enums"]["prayer_status"] | null
          prev_record_id: string | null
          report_id: string
          updated_at: string
          week_key: string
          worship_attended: boolean
          worship_online: boolean
        }
        Insert: {
          absent_reason?: string | null
          author_id: string
          created_at?: string
          group_id_at_write: string
          group_meeting_attended?: boolean
          id?: string
          meeting_absent_reason?: string | null
          note?: string | null
          one_on_one_contacted?: boolean
          online_reason?: string | null
          person_id: string
          prayer_request?: string | null
          prayer_status?: Database["public"]["Enums"]["prayer_status"] | null
          prev_record_id?: string | null
          report_id: string
          updated_at?: string
          week_key: string
          worship_attended?: boolean
          worship_online?: boolean
        }
        Update: {
          absent_reason?: string | null
          author_id?: string
          created_at?: string
          group_id_at_write?: string
          group_meeting_attended?: boolean
          id?: string
          meeting_absent_reason?: string | null
          note?: string | null
          one_on_one_contacted?: boolean
          online_reason?: string | null
          person_id?: string
          prayer_request?: string | null
          prayer_status?: Database["public"]["Enums"]["prayer_status"] | null
          prev_record_id?: string | null
          report_id?: string
          updated_at?: string
          week_key?: string
          worship_attended?: boolean
          worship_online?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "weekly_records_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_group_id_at_write_fkey"
            columns: ["group_id_at_write"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_prev_record_id_fkey"
            columns: ["prev_record_id"]
            isOneToOne: false
            referencedRelation: "weekly_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_prev_record_id_fkey"
            columns: ["prev_record_id"]
            isOneToOne: false
            referencedRelation: "weekly_records_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      world_avatar_shots: {
        Row: {
          image: string
          updated_at: string
          user_id: string
        }
        Insert: {
          image: string
          updated_at?: string
          user_id: string
        }
        Update: {
          image?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_avatar_shots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_avatars: {
        Row: {
          look: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          look: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          look?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_avatars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_inventory: {
        Row: {
          group_id: string
          item_id: string
          qty: number
        }
        Insert: {
          group_id: string
          item_id: string
          qty: number
        }
        Update: {
          group_id?: string
          item_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_inventory_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "world_items"
            referencedColumns: ["id"]
          },
        ]
      }
      world_items: {
        Row: {
          blurb: string
          cat: string
          id: string
          name: string
          price: number
          slot: string | null
          sort: number
        }
        Insert: {
          blurb?: string
          cat: string
          id: string
          name: string
          price: number
          slot?: string | null
          sort?: number
        }
        Update: {
          blurb?: string
          cat?: string
          id?: string
          name?: string
          price?: number
          slot?: string | null
          sort?: number
        }
        Relationships: []
      }
      world_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          group_id: string
          id: number
          item_id: string | null
          reason: string
          ref_id: string | null
          week_key: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          group_id: string
          id?: never
          item_id?: string | null
          reason: string
          ref_id?: string | null
          week_key?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          group_id?: string
          id?: never
          item_id?: string | null
          reason?: string
          ref_id?: string | null
          week_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_ledger_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "world_items"
            referencedColumns: ["id"]
          },
        ]
      }
      world_room_shots: {
        Row: {
          group_id: string
          image: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          group_id: string
          image: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          group_id?: string
          image?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_room_shots_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_room_shots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_rules: {
        Row: {
          key: string
          note: string
          value: number
        }
        Insert: {
          key: string
          note: string
          value: number
        }
        Update: {
          key?: string
          note?: string
          value?: number
        }
        Relationships: []
      }
      world_streak_freezes: {
        Row: {
          group_id: string
          used_at: string
          used_by: string | null
          week_key: string
        }
        Insert: {
          group_id: string
          used_at?: string
          used_by?: string | null
          week_key: string
        }
        Update: {
          group_id?: string
          used_at?: string
          used_by?: string | null
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_streak_freezes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_streak_freezes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_villages: {
        Row: {
          fence: string
          group_id: string
          rooms: Json
          slots: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fence: string
          group_id: string
          rooms?: Json
          slots: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fence?: string
          group_id?: string
          rooms?: Json
          slots?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_villages_fence_fkey"
            columns: ["fence"]
            isOneToOne: false
            referencedRelation: "world_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_villages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_villages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      persons_public: {
        Row: {
          course: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          group_id: string | null
          group_role: Database["public"]["Enums"]["group_role"] | null
          id: string | null
          is_group_head: boolean | null
          name: string | null
          training_stage: string | null
        }
        Insert: {
          course?: never
          gender?: Database["public"]["Enums"]["gender"] | null
          group_id?: string | null
          group_role?: Database["public"]["Enums"]["group_role"] | null
          id?: string | null
          is_group_head?: boolean | null
          name?: string | null
          training_stage?: string | null
        }
        Update: {
          course?: never
          gender?: Database["public"]["Enums"]["gender"] | null
          group_id?: string | null
          group_role?: Database["public"]["Enums"]["group_role"] | null
          id?: string | null
          is_group_head?: boolean | null
          name?: string | null
          training_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_records_visible: {
        Row: {
          absent_reason: string | null
          author_id: string | null
          created_at: string | null
          group_id_at_write: string | null
          group_meeting_attended: boolean | null
          id: string | null
          meeting_absent_reason: string | null
          note: string | null
          one_on_one_contacted: boolean | null
          online_reason: string | null
          person_id: string | null
          prayer_request: string | null
          prayer_status: Database["public"]["Enums"]["prayer_status"] | null
          prev_record_id: string | null
          report_id: string | null
          updated_at: string | null
          week_key: string | null
          worship_attended: boolean | null
          worship_online: boolean | null
        }
        Insert: {
          absent_reason?: string | null
          author_id?: string | null
          created_at?: string | null
          group_id_at_write?: string | null
          group_meeting_attended?: boolean | null
          id?: string | null
          meeting_absent_reason?: string | null
          note?: string | null
          one_on_one_contacted?: boolean | null
          online_reason?: string | null
          person_id?: string | null
          prayer_request?: string | null
          prayer_status?: Database["public"]["Enums"]["prayer_status"] | null
          prev_record_id?: string | null
          report_id?: string | null
          updated_at?: string | null
          week_key?: string | null
          worship_attended?: boolean | null
          worship_online?: boolean | null
        }
        Update: {
          absent_reason?: string | null
          author_id?: string | null
          created_at?: string | null
          group_id_at_write?: string | null
          group_meeting_attended?: boolean | null
          id?: string | null
          meeting_absent_reason?: string | null
          note?: string | null
          one_on_one_contacted?: boolean | null
          online_reason?: string | null
          person_id?: string | null
          prayer_request?: string | null
          prayer_status?: Database["public"]["Enums"]["prayer_status"] | null
          prev_record_id?: string | null
          report_id?: string | null
          updated_at?: string | null
          week_key?: string | null
          worship_attended?: boolean | null
          worship_online?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_records_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_group_id_at_write_fkey"
            columns: ["group_id_at_write"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_prev_record_id_fkey"
            columns: ["prev_record_id"]
            isOneToOne: false
            referencedRelation: "weekly_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_prev_record_id_fkey"
            columns: ["prev_record_id"]
            isOneToOne: false
            referencedRelation: "weekly_records_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_records_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _group_streak: {
        Args: { p_group: string; p_now: string; p_week_key: string }
        Returns: number
      }
      _streak_start: { Args: never; Returns: string }
      _world_deadline: { Args: { p_week: string }; Returns: string }
      _world_ensure: { Args: { p_group: string }; Returns: undefined }
      _world_freezable: {
        Args: { p_group: string; p_now: string }
        Returns: string
      }
      _world_freeze: {
        Args: {
          p_buy: boolean
          p_group: string
          p_now: string
          p_user: string
          p_week: string
        }
        Returns: Json
      }
      _world_freeze_block: {
        Args: { p_group: string; p_now: string; p_week: string }
        Returns: string
      }
      _world_leader_group: { Args: never; Returns: string }
      _world_my_group: { Args: never; Returns: string }
      _world_rule: { Args: { p_key: string }; Returns: number }
      _world_special: { Args: { p_number: number }; Returns: string }
      _world_streak: {
        Args: { p_group: string; p_week: string }
        Returns: number
      }
      _world_term_start: { Args: { p_week: string }; Returns: string }
      _world_term_used: {
        Args: { p_group: string; p_week: string }
        Returns: number
      }
      admin_update_account: {
        Args: { p_action: string; p_user_id: string }
        Returns: undefined
      }
      agree_terms: { Args: { p_version: string }; Returns: undefined }
      apply_for_person: { Args: { p_person_id: string }; Returns: string }
      approve_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      attendance_book: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          online: boolean
          onsite: boolean
          person_id: string
          week_key: string
        }[]
      }
      attendance_people: {
        Args: never
        Returns: {
          assembly_member: boolean
          campus: string
          care_status: Database["public"]["Enums"]["care_status"]
          group_id: string
          group_role: Database["public"]["Enums"]["group_role"]
          id: string
          is_group_head: boolean
          joined_at: string
          name: string
          report_hidden: boolean
          attendance_off: string
          training_stage: string
        }[]
      }
      attendance_start: { Args: never; Returns: string }
      can_manage_weeks: { Args: never; Returns: boolean }
      cancel_my_application: { Args: never; Returns: undefined }
      care_blind_spots: {
        Args: { p_now?: string; p_week_key: string }
        Returns: {
          absent_streak: boolean
          care_status: Database["public"]["Enums"]["care_status"]
          contact_gap: boolean
          contact_leaders: number
          group_id: string
          group_role: Database["public"]["Enums"]["group_role"]
          last_contact_week: string
          last_meeting_week: string
          last_worship_week: string
          meeting_gap: boolean
          needs_check: boolean
          person_id: string
          state: string
          weeks_recorded: number
          window_end: string
          window_start: string
        }[]
      }
      care_density: {
        Args: { p_now?: string; p_week_key: string }
        Returns: {
          connected_pairs: number
          density: number
          group_id: string
          leaders: number
          possible_pairs: number
          state: string
          targets: number
          window_end: string
          window_start: string
        }[]
      }
      care_gender_balance: {
        Args: never
        Returns: {
          alert: string
          gender: Database["public"]["Enums"]["gender"]
          group_id: string
          leaders: number
          members: number
          per_leader: number
        }[]
      }
      care_window: {
        Args: { p_now?: string; p_week_key: string }
        Returns: string[]
      }
      chat_month_of: { Args: { p_at: string }; Returns: string }
      chat_quota_base: { Args: never; Returns: number }
      chat_quota_commit: {
        Args: { p_hold: string }
        Returns: {
          quota: number
          used: number
        }[]
      }
      chat_quota_hold_ttl: { Args: never; Returns: string }
      chat_quota_kind: { Args: never; Returns: string }
      chat_quota_pending_count: { Args: never; Returns: number }
      chat_quota_purge_reasons: { Args: never; Returns: undefined }
      chat_quota_release: { Args: { p_hold: string }; Returns: undefined }
      chat_quota_reserve: {
        Args: never
        Returns: {
          hold_id: string
          quota: number
          unlimited: boolean
          used: number
        }[]
      }
      chat_quota_status: {
        Args: never
        Returns: {
          can_auto: boolean
          has_pending: boolean
          last_status: Database["public"]["Enums"]["chat_request_status"]
          month: string
          quota: number
          unlimited: boolean
          used: number
        }[]
      }
      claim_push: {
        Args: { p_key: string; p_users: string[] }
        Returns: string[]
      }
      clear_profile_photo: { Args: never; Returns: undefined }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_group_id: { Args: never; Returns: string }
      current_person_id: { Args: never; Returns: string }
      current_user_context: {
        Args: never
        Returns: {
          application_status: Database["public"]["Enums"]["application_status"]
          group_id: string
          group_name: string
          group_number: number
          group_role: Database["public"]["Enums"]["group_role"]
          is_group_head: boolean
          is_officer: boolean
          name: string
          pending_group_name: string
          pending_group_number: number
          pending_person_name: string
          pending_role: Database["public"]["Enums"]["user_role"]
          person_id: string
          person_name: string
          provider: Database["public"]["Enums"]["auth_provider"]
          role: Database["public"]["Enums"]["user_role"]
          terms_version: string
          user_id: string
        }[]
      }
      current_user_id: { Args: never; Returns: string }
      decide_chat_quota_request: {
        Args: { p_amount?: number; p_id: string }
        Returns: string
      }
      decide_dormancy: {
        Args: { p_approve: boolean; p_person_id: string }
        Returns: undefined
      }
      digest_claim: { Args: { p_week: string }; Returns: boolean }
      digest_health: {
        Args: never
        Returns: {
          dropped: number
          fail_reason: string
          generated_at: string
          group_count: number
          regen_count: number
          report_count: number
          skipped: boolean
          status: string
          week_key: string
        }[]
      }
      digest_regen: { Args: { p_week: string }; Returns: boolean }
      digest_save: {
        Args: {
          p_content: Json
          p_fail_reason: string
          p_group_count?: number
          p_input_tokens: number
          p_model: string
          p_ms: number
          p_ok: boolean
          p_output_tokens: number
          p_report_count?: number
          p_week: string
        }
        Returns: undefined
      }
      ensure_user: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      group_board: {
        Args: { p_now?: string; p_week_key: string }
        Returns: {
          berries: number
          group_id: string
          name: string
          number: number
          streak: number
        }[]
      }
      group_streaks: {
        Args: { p_now?: string; p_week_key: string }
        Returns: {
          broken: boolean
          current_included: boolean
          ever_on_time: boolean
          group_id: string
          streak: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_app_user: { Args: never; Returns: boolean }
      is_leader_of: { Args: { target_group_id: string }; Returns: boolean }
      is_officer: { Args: never; Returns: boolean }
      is_pastor: { Args: never; Returns: boolean }
      kst_current_week: { Args: never; Returns: string }
      list_application_groups: {
        Args: never
        Returns: {
          id: string
          name: string
          number: number
        }[]
      }
      list_chat_quota_requests: {
        Args: never
        Returns: {
          created_at: string
          group_name: string
          id: string
          mine: boolean
          name: string
          quota: number
          reason: string
          used: number
          user_id: string
        }[]
      }
      list_claimable_persons: {
        Args: { p_group_id: string }
        Returns: {
          birth_year: number
          claimed: boolean
          claimed_provider: Database["public"]["Enums"]["auth_provider"]
          group_role: Database["public"]["Enums"]["group_role"]
          id: string
          name: string
        }[]
      }
      list_pending_applications: {
        Args: never
        Returns: {
          applicant_email: string
          applicant_name: string
          group_id: string
          group_name: string
          group_number: number
          id: string
          person_birth_date: string
          person_birth_year: number
          person_name: string
          person_id: string
          person_linked: boolean
          applicant_active: boolean
          provider: Database["public"]["Enums"]["auth_provider"]
          requested_at: string
          requested_role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      request_group_move: {
        Args: { p_person_id: string; p_to_group_id: string; p_note?: string | null }
        Returns: string
      }
      cancel_group_move: {
        Args: { p_id: string }
        Returns: undefined
      }
      decide_group_move: {
        Args: { p_id: string; p_accept: boolean }
        Returns: Json
      }
      list_group_moves: {
        Args: never
        Returns: {
          id: string
          person_id: string
          person_name: string
          from_group_id: string
          from_group_name: string
          to_group_id: string
          to_group_name: string
          direction: string
          note: string | null
          requested_by: string | null
          requester_name: string | null
          requested_at: string
          can_decide: boolean
          mine: boolean
        }[]
      }
      push_group_leader_targets: {
        Args: { p_group_id: string }
        Returns: { user_id: string }[]
      }
      same_name_persons: {
        Args: { p_name: string }
        Returns: {
          person_id: string
          group_id: string | null
          group_name: string | null
          status: Database["public"]["Enums"]["person_status"]
        }[]
      }
      unstamped_reports: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          report_id: string
          week_key: string
          group_id: string
          group_name: string
          submitted_at: string
          is_late: boolean
          total: number
        }[]
      }
      log_attendance_export: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      log_export: {
        Args: {
          p_end: string
          p_format: Database["public"]["Enums"]["export_format"]
          p_group_ids: string[]
          p_start: string
        }
        Returns: number
      }
      log_roster_export: { Args: { p_group_id?: string }; Returns: number }
      mark_report_read: { Args: { p_report_id: string }; Returns: undefined }
      move_person_group: {
        Args: { p_group_id: string; p_person_id: string }
        Returns: undefined
      }
      my_account_locked: { Args: never; Returns: boolean }
      my_ai_consent: { Args: never; Returns: string }
      needs_check_people: {
        Args: never
        Returns: {
          group_id: string
          group_name: string
          group_number: number
          group_role: Database["public"]["Enums"]["group_role"]
          name: string
          person_id: string
        }[]
      }
      open_report: {
        Args: { p_group_id: string; p_week_key: string }
        Returns: string
      }
      person_photo: { Args: { p_person_id: string }; Returns: string }
      person_photos: {
        Args: { p_person_ids: string[] }
        Returns: {
          person_id: string
          updated_at: string
        }[]
      }
      person_profile: {
        Args: { p_person_id: string }
        Returns: {
          bio: string
          has_account: boolean
          interests: string[]
          photo_at: string
          verse: string
        }[]
      }
      prayer_streaks: {
        Args: { p_week_key: string }
        Returns: {
          first_ever: boolean
          group_id: string
          person_id: string
          prayer_request: string
          weeks: number
        }[]
      }
      profile_ddays_valid: { Args: { v: Json }; Returns: boolean }
      profile_theme_songs_valid: { Args: { v: Json }; Returns: boolean }
      purge_expired_records: {
        Args: never
        Returns: {
          deleted_records: number
          deleted_reports: number
        }[]
      }
      push_admin_targets: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      push_digest_targets: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      push_group_targets: {
        Args: { p_exclude?: string; p_report_id: string }
        Returns: {
          group_id: string
          group_name: string
          user_id: string
          week_key: string
        }[]
      }
      push_registration_status: {
        Args: never
        Returns: {
          devices: number
          group_name: string
          last_success_at: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      push_reminder_targets: {
        Args: { p_week_key: string }
        Returns: {
          group_id: string
          group_name: string
          user_id: string
        }[]
      }
      recorded_person_names: {
        Args: { p_ids: string[] }
        Returns: {
          group_role: Database["public"]["Enums"]["group_role"]
          id: string
          name: string
          status: Database["public"]["Enums"]["person_status"]
        }[]
      }
      records_past_retention: {
        Args: never
        Returns: {
          cutoff_week: string
          expired_records: number
          expired_reports: number
        }[]
      }
      reject_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      remove_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      request_chat_quota: {
        Args: { p_reason?: string }
        Returns: {
          request_id: string
          status: Database["public"]["Enums"]["chat_request_status"]
        }[]
      }
      request_dormancy: {
        Args: { p_on?: boolean; p_person_id: string }
        Returns: undefined
      }
      request_role: {
        Args: {
          p_person_id?: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      retention_cutoff: { Args: never; Returns: string }
      roster_people: {
        Args: never
        Returns: {
          care_status: Database["public"]["Enums"]["care_status"]
          group_id: string
          group_role: Database["public"]["Enums"]["group_role"]
          has_account: boolean
          id: string
          is_group_head: boolean
          name: string
          needs_check: boolean
          status: Database["public"]["Enums"]["person_status"]
        }[]
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      set_group_head: {
        Args: { p_on: boolean; p_person_id: string }
        Returns: undefined
      }
      set_group_village: {
        Args: { p_group_id: string; p_village: string }
        Returns: undefined
      }
      set_my_ai_consent: { Args: { p_on: boolean }; Returns: string }
      set_my_profile: {
        Args: { p_bio: string; p_interests: string[]; p_verse: string }
        Returns: undefined
      }
      set_person_recording: {
        Args: { p_person_id: string; p_recording: boolean }
        Returns: undefined
      }
      set_profile_photo: { Args: { p_image: string }; Returns: string }
      set_report_note: {
        Args: { p_note: string; p_report_id: string }
        Returns: string
      }
      set_report_stamp: {
        Args: {
          p_report_id: string
          p_stamp: Database["public"]["Enums"]["report_stamp"]
        }
        Returns: Database["public"]["Enums"]["report_stamp"]
      }
      submit_report: {
        Args: {
          p_no_meeting?: boolean
          p_note?: string
          p_note_base?: string
          p_note_check?: boolean
          p_note_dirty?: boolean
          p_report_id: string
          p_rows: Json
          p_submit?: boolean
        }
        Returns: Json
      }
      touch_report_presence: {
        Args: { p_report_id: string }
        Returns: {
          name: string
        }[]
      }
      unlink_person_account: {
        Args: { p_disable?: boolean; p_person_id: string }
        Returns: undefined
      }
      week_submission_count: {
        Args: { p_week_key: string }
        Returns: {
          submitted: number
          total: number
        }[]
      }
      world_buy: { Args: { p_item: string }; Returns: Json }
      world_save_look: { Args: { p_look: Json }; Returns: undefined }
      world_set_avatar_shot: { Args: { p_image: string }; Returns: string }
      world_set_room: {
        Args: { p_house: number; p_slots: string[] }
        Returns: undefined
      }
      world_set_room_shot: { Args: { p_image: string }; Returns: string }
      world_set_village: {
        Args: { p_fence: string; p_slots: string[] }
        Returns: undefined
      }
      world_state: { Args: never; Returns: Json }
      world_summary: { Args: never; Returns: Json }
      world_use_freeze: {
        Args: { p_buy?: boolean; p_week: string }
        Returns: Json
      }
    }
    Enums: {
      application_status: "pending" | "approved" | "rejected"
      auth_provider: "kakao" | "google"
      care_status:
        | "active"
        | "military"
        | "remote"
        | "exchange"
        | "weekend_work"
        | "other_church"
        | "long_absent"
      chat_request_status: "auto" | "pending" | "approved" | "rejected"
      dormancy_request_status: "none" | "pending" | "approved"
      group_move_status: "pending" | "accepted" | "rejected" | "cancelled" | "expired"
      event_type:
        | "report_opened"
        | "report_submitted"
        | "comment_created"
        | "account_unlinked"
      export_format: "xlsx" | "print" | "roster" | "attendance"
      gender: "male" | "female"
      group_role: "leader" | "member"
      group_status: "active" | "disbanded" | "special"
      person_status: "active" | "dormant" | "opted_out" | "left"
      prayer_status: "new" | "ongoing" | "answered"
      report_stamp: "pray"
      user_role: "pending" | "leader" | "pastor" | "admin" | "officer"
      user_status: "active" | "inactive"
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
    Enums: {
      application_status: ["pending", "approved", "rejected"],
      auth_provider: ["kakao", "google"],
      care_status: [
        "active",
        "military",
        "remote",
        "exchange",
        "weekend_work",
        "other_church",
        "long_absent",
      ],
      chat_request_status: ["auto", "pending", "approved", "rejected"],
      dormancy_request_status: ["none", "pending", "approved"],
      group_move_status: ["pending", "accepted", "rejected", "cancelled", "expired"],
      event_type: [
        "report_opened",
        "report_submitted",
        "comment_created",
        "account_unlinked",
      ],
      export_format: ["xlsx", "print", "roster", "attendance"],
      gender: ["male", "female"],
      group_role: ["leader", "member"],
      group_status: ["active", "disbanded", "special"],
      person_status: ["active", "dormant", "opted_out", "left"],
      prayer_status: ["new", "ongoing", "answered"],
      report_stamp: ["pray"],
      user_role: ["pending", "leader", "pastor", "admin", "officer"],
      user_status: ["active", "inactive"],
    },
  },
} as const
