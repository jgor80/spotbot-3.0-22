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
      active_game_sessions: {
        Row: {
          club_key: string
          created_at: string | null
          detected_score: string | null
          ended_at: string | null
          guild_id: string
          id: string
          last_score: string | null
          player_count: number
          players: Json
          started_at: string | null
          status: string | null
        }
        Insert: {
          club_key: string
          created_at?: string | null
          detected_score?: string | null
          ended_at?: string | null
          guild_id: string
          id?: string
          last_score?: string | null
          player_count: number
          players: Json
          started_at?: string | null
          status?: string | null
        }
        Update: {
          club_key?: string
          created_at?: string | null
          detected_score?: string | null
          ended_at?: string | null
          guild_id?: string
          id?: string
          last_score?: string | null
          player_count?: number
          players?: Json
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          actually_showed: boolean | null
          discord_user_id: string
          event_id: string | null
          guild_id: string
          id: string
          recorded_at: string
          recorded_by_discord_id: string | null
          said_available: boolean
        }
        Insert: {
          actually_showed?: boolean | null
          discord_user_id: string
          event_id?: string | null
          guild_id: string
          id?: string
          recorded_at?: string
          recorded_by_discord_id?: string | null
          said_available: boolean
        }
        Update: {
          actually_showed?: boolean | null
          discord_user_id?: string
          event_id?: string | null
          guild_id?: string
          id?: string
          recorded_at?: string
          recorded_by_discord_id?: string | null
          said_available?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "availability_events"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_events: {
        Row: {
          cancelled: boolean
          channel_id: string | null
          checkin_message_id: string | null
          checkin_opened_at: string | null
          closed: boolean
          club_key: string | null
          created_at: string
          created_by_discord_id: string
          deadline_at: string | null
          deadline_reminder_sent: boolean
          description: string | null
          duration_minutes: number | null
          event_type: string
          guild_id: string
          id: string
          message_id: string | null
          ping_role_id: string | null
          position_signup: boolean
          reminder_24h_sent: boolean
          reminder_2h_sent: boolean
          scheduled_at: string
          series_id: string | null
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cancelled?: boolean
          channel_id?: string | null
          checkin_message_id?: string | null
          checkin_opened_at?: string | null
          closed?: boolean
          club_key?: string | null
          created_at?: string
          created_by_discord_id: string
          deadline_at?: string | null
          deadline_reminder_sent?: boolean
          description?: string | null
          duration_minutes?: number | null
          event_type?: string
          guild_id: string
          id?: string
          message_id?: string | null
          ping_role_id?: string | null
          position_signup?: boolean
          reminder_24h_sent?: boolean
          reminder_2h_sent?: boolean
          scheduled_at: string
          series_id?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cancelled?: boolean
          channel_id?: string | null
          checkin_message_id?: string | null
          checkin_opened_at?: string | null
          closed?: boolean
          club_key?: string | null
          created_at?: string
          created_by_discord_id?: string
          deadline_at?: string | null
          deadline_reminder_sent?: boolean
          description?: string | null
          duration_minutes?: number | null
          event_type?: string
          guild_id?: string
          id?: string
          message_id?: string | null
          ping_role_id?: string | null
          position_signup?: boolean
          reminder_24h_sent?: boolean
          reminder_2h_sent?: boolean
          scheduled_at?: string
          series_id?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_at: string
          guild_id: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_at?: string
          guild_id: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_at?: string
          guild_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      club_matches: {
        Row: {
          club_key: string
          created_at: string | null
          ea_match_id: string
          guild_id: string
          id: string
          match_data: Json | null
          match_type: string
          opponent_club_id: string | null
          opponent_club_name: string | null
          player_stats: Json | null
          processed_at: string | null
          recruit_scanned_at: string | null
          result: string | null
          score_against: number | null
          score_for: number | null
          session_id: string | null
        }
        Insert: {
          club_key: string
          created_at?: string | null
          ea_match_id: string
          guild_id: string
          id?: string
          match_data?: Json | null
          match_type?: string
          opponent_club_id?: string | null
          opponent_club_name?: string | null
          player_stats?: Json | null
          processed_at?: string | null
          recruit_scanned_at?: string | null
          result?: string | null
          score_against?: number | null
          score_for?: number | null
          session_id?: string | null
        }
        Update: {
          club_key?: string
          created_at?: string | null
          ea_match_id?: string
          guild_id?: string
          id?: string
          match_data?: Json | null
          match_type?: string
          opponent_club_id?: string | null
          opponent_club_name?: string | null
          player_stats?: Json | null
          processed_at?: string | null
          recruit_scanned_at?: string | null
          result?: string | null
          score_against?: number | null
          score_for?: number | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "club_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      club_sessions: {
        Row: {
          clean_sheets: number | null
          club_key: string
          created_at: string | null
          draws: number | null
          ended_at: string | null
          goals_against: number | null
          goals_for: number | null
          guild_id: string
          id: string
          losses: number | null
          match_count: number | null
          player_count: number | null
          players: Json | null
          red_cards: number | null
          started_at: string
          total_assists: number | null
          total_pass_attempts: number | null
          total_passes_made: number | null
          total_shots: number | null
          total_shots_on_target: number | null
          total_tackle_attempts: number | null
          total_tackles: number | null
          wins: number | null
        }
        Insert: {
          clean_sheets?: number | null
          club_key: string
          created_at?: string | null
          draws?: number | null
          ended_at?: string | null
          goals_against?: number | null
          goals_for?: number | null
          guild_id: string
          id?: string
          losses?: number | null
          match_count?: number | null
          player_count?: number | null
          players?: Json | null
          red_cards?: number | null
          started_at: string
          total_assists?: number | null
          total_pass_attempts?: number | null
          total_passes_made?: number | null
          total_shots?: number | null
          total_shots_on_target?: number | null
          total_tackle_attempts?: number | null
          total_tackles?: number | null
          wins?: number | null
        }
        Update: {
          clean_sheets?: number | null
          club_key?: string
          created_at?: string | null
          draws?: number | null
          ended_at?: string | null
          goals_against?: number | null
          goals_for?: number | null
          guild_id?: string
          id?: string
          losses?: number | null
          match_count?: number | null
          player_count?: number | null
          players?: Json | null
          red_cards?: number | null
          started_at?: string
          total_assists?: number | null
          total_pass_attempts?: number | null
          total_passes_made?: number | null
          total_shots?: number | null
          total_shots_on_target?: number | null
          total_tackle_attempts?: number | null
          total_tackles?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      club_stats: {
        Row: {
          best_division: string | null
          club_key: string
          club_name: string | null
          created_at: string
          crest_id: string | null
          cup_games: number | null
          current_division: string | null
          custom_kit_home: Json | null
          draws: number | null
          ea_club_id: string
          ea_platform: string
          friendly_games: number | null
          goals_conceded: number | null
          goals_scored: number | null
          guild_id: string
          id: string
          last_10_results: string[] | null
          last_5_results: string[] | null
          last_synced_at: string | null
          league_games: number | null
          loss_streak: number | null
          losses: number | null
          overall_matches_played: number | null
          playoff_achievements: Json | null
          previous_division: string | null
          promotions: number | null
          region: string | null
          relegations: number | null
          reputation_tier: string | null
          skill_rating: number | null
          stadium_name: string | null
          total_clean_sheets: number | null
          total_members: number | null
          unbeaten_streak: number | null
          updated_at: string
          win_streak: number | null
          wins: number | null
        }
        Insert: {
          best_division?: string | null
          club_key: string
          club_name?: string | null
          created_at?: string
          crest_id?: string | null
          cup_games?: number | null
          current_division?: string | null
          custom_kit_home?: Json | null
          draws?: number | null
          ea_club_id: string
          ea_platform: string
          friendly_games?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          guild_id: string
          id?: string
          last_10_results?: string[] | null
          last_5_results?: string[] | null
          last_synced_at?: string | null
          league_games?: number | null
          loss_streak?: number | null
          losses?: number | null
          overall_matches_played?: number | null
          playoff_achievements?: Json | null
          previous_division?: string | null
          promotions?: number | null
          region?: string | null
          relegations?: number | null
          reputation_tier?: string | null
          skill_rating?: number | null
          stadium_name?: string | null
          total_clean_sheets?: number | null
          total_members?: number | null
          unbeaten_streak?: number | null
          updated_at?: string
          win_streak?: number | null
          wins?: number | null
        }
        Update: {
          best_division?: string | null
          club_key?: string
          club_name?: string | null
          created_at?: string
          crest_id?: string | null
          cup_games?: number | null
          current_division?: string | null
          custom_kit_home?: Json | null
          draws?: number | null
          ea_club_id?: string
          ea_platform?: string
          friendly_games?: number | null
          goals_conceded?: number | null
          goals_scored?: number | null
          guild_id?: string
          id?: string
          last_10_results?: string[] | null
          last_5_results?: string[] | null
          last_synced_at?: string | null
          league_games?: number | null
          loss_streak?: number | null
          losses?: number | null
          overall_matches_played?: number | null
          playoff_achievements?: Json | null
          previous_division?: string | null
          promotions?: number | null
          region?: string | null
          relegations?: number | null
          reputation_tier?: string | null
          skill_rating?: number | null
          stadium_name?: string | null
          total_clean_sheets?: number | null
          total_members?: number | null
          unbeaten_streak?: number | null
          updated_at?: string
          win_streak?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      competition_wins: {
        Row: {
          competition_name: string
          competition_type: Database["public"]["Enums"]["competition_type"]
          created_at: string
          discord_user_id: string
          guild_id: string
          id: string
          placed_at: string | null
          team_name: string | null
          tier: Database["public"]["Enums"]["competition_tier"]
          verified: boolean
          verified_at: string | null
          verified_by_discord_id: string | null
        }
        Insert: {
          competition_name: string
          competition_type: Database["public"]["Enums"]["competition_type"]
          created_at?: string
          discord_user_id: string
          guild_id: string
          id?: string
          placed_at?: string | null
          team_name?: string | null
          tier: Database["public"]["Enums"]["competition_tier"]
          verified?: boolean
          verified_at?: string | null
          verified_by_discord_id?: string | null
        }
        Update: {
          competition_name?: string
          competition_type?: Database["public"]["Enums"]["competition_type"]
          created_at?: string
          discord_user_id?: string
          guild_id?: string
          id?: string
          placed_at?: string | null
          team_name?: string | null
          tier?: Database["public"]["Enums"]["competition_tier"]
          verified?: boolean
          verified_at?: string | null
          verified_by_discord_id?: string | null
        }
        Relationships: []
      }
      dm_feedback_requests: {
        Row: {
          club_match_id: string | null
          completed_at: string | null
          created_at: string
          dm_sent_at: string | null
          draft_id: string | null
          evaluator_discord_id: string
          expires_at: string
          guild_id: string
          id: string
          match_type: string | null
          pending_energy: number | null
          pending_enjoyment: number | null
          pending_performance: number | null
          pending_player_id: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          teammates_data: Json | null
          teammates_to_evaluate: string[]
        }
        Insert: {
          club_match_id?: string | null
          completed_at?: string | null
          created_at?: string
          dm_sent_at?: string | null
          draft_id?: string | null
          evaluator_discord_id: string
          expires_at: string
          guild_id: string
          id?: string
          match_type?: string | null
          pending_energy?: number | null
          pending_enjoyment?: number | null
          pending_performance?: number | null
          pending_player_id?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          teammates_data?: Json | null
          teammates_to_evaluate?: string[]
        }
        Update: {
          club_match_id?: string | null
          completed_at?: string | null
          created_at?: string
          dm_sent_at?: string | null
          draft_id?: string | null
          evaluator_discord_id?: string
          expires_at?: string
          guild_id?: string
          id?: string
          match_type?: string | null
          pending_energy?: number | null
          pending_enjoyment?: number | null
          pending_performance?: number | null
          pending_player_id?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          teammates_data?: Json | null
          teammates_to_evaluate?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "dm_feedback_requests_club_match_id_fkey"
            columns: ["club_match_id"]
            isOneToOne: false
            referencedRelation: "club_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_feedback_requests_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_picks: {
        Row: {
          captain_discord_id: string
          draft_id: string
          id: string
          pick_number: number
          picked_at: string
          picked_player_discord_id: string
          team: string
        }
        Insert: {
          captain_discord_id: string
          draft_id: string
          id?: string
          pick_number: number
          picked_at?: string
          picked_player_discord_id: string
          team: string
        }
        Update: {
          captain_discord_id?: string
          draft_id?: string
          id?: string
          pick_number?: number
          picked_at?: string
          picked_player_discord_id?: string
          team?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_results: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string[]
          created_at: string
          disputed_by: string[]
          draft_id: string
          ea_match_id: string | null
          id: string
          reported_by: string[]
          status: Database["public"]["Enums"]["result_status"]
          team_a_score: number | null
          team_b_score: number | null
          winning_team: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string[]
          created_at?: string
          disputed_by?: string[]
          draft_id: string
          ea_match_id?: string | null
          id?: string
          reported_by?: string[]
          status?: Database["public"]["Enums"]["result_status"]
          team_a_score?: number | null
          team_b_score?: number | null
          winning_team?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string[]
          created_at?: string
          disputed_by?: string[]
          draft_id?: string
          ea_match_id?: string | null
          id?: string
          reported_by?: string[]
          status?: Database["public"]["Enums"]["result_status"]
          team_a_score?: number | null
          team_b_score?: number | null
          winning_team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_results_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          available_player_ids: string[]
          captain_a_confirmed: boolean | null
          captain_a_discord_id: string
          captain_b_confirmed: boolean | null
          captain_b_discord_id: string
          completed_at: string | null
          confirmation_expires_at: string | null
          confirmation_message_id: string | null
          created_at: string
          current_picker: string | null
          guild_id: string
          id: string
          pick_number: number
          started_at: string | null
          status: Database["public"]["Enums"]["draft_status"]
          team_a_player_ids: string[]
          team_a_vc_id: string | null
          team_b_player_ids: string[]
          team_b_vc_id: string | null
          updated_at: string
          voice_channel_id: string | null
        }
        Insert: {
          available_player_ids?: string[]
          captain_a_confirmed?: boolean | null
          captain_a_discord_id: string
          captain_b_confirmed?: boolean | null
          captain_b_discord_id: string
          completed_at?: string | null
          confirmation_expires_at?: string | null
          confirmation_message_id?: string | null
          created_at?: string
          current_picker?: string | null
          guild_id: string
          id?: string
          pick_number?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          team_a_player_ids?: string[]
          team_a_vc_id?: string | null
          team_b_player_ids?: string[]
          team_b_vc_id?: string | null
          updated_at?: string
          voice_channel_id?: string | null
        }
        Update: {
          available_player_ids?: string[]
          captain_a_confirmed?: boolean | null
          captain_a_discord_id?: string
          captain_b_confirmed?: boolean | null
          captain_b_discord_id?: string
          completed_at?: string | null
          confirmation_expires_at?: string | null
          confirmation_message_id?: string | null
          created_at?: string
          current_picker?: string | null
          guild_id?: string
          id?: string
          pick_number?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          team_a_player_ids?: string[]
          team_a_vc_id?: string | null
          team_b_player_ids?: string[]
          team_b_vc_id?: string | null
          updated_at?: string
          voice_channel_id?: string | null
        }
        Relationships: []
      }
      evaluator_trust_scores: {
        Row: {
          accuracy_score: number | null
          discord_user_id: string
          evaluations_given: number
          guild_id: string
          id: string
          tenure_months: number
          trust_score: number
          updated_at: string
        }
        Insert: {
          accuracy_score?: number | null
          discord_user_id: string
          evaluations_given?: number
          guild_id: string
          id?: string
          tenure_months?: number
          trust_score?: number
          updated_at?: string
        }
        Update: {
          accuracy_score?: number | null
          discord_user_id?: string
          evaluations_given?: number
          guild_id?: string
          id?: string
          tenure_months?: number
          trust_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      event_checkins: {
        Row: {
          checked_in_at: string
          discord_user_id: string
          event_id: string
          id: string
          status: string
        }
        Insert: {
          checked_in_at?: string
          discord_user_id: string
          event_id: string
          id?: string
          status: string
        }
        Update: {
          checked_in_at?: string
          discord_user_id?: string
          event_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "availability_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_code_mappings: {
        Row: {
          category: string | null
          confidence: string
          correlation_stats: Json | null
          derive: boolean | null
          event_code: number
          label: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          confidence: string
          correlation_stats?: Json | null
          derive?: boolean | null
          event_code: number
          label: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          confidence?: string
          correlation_stats?: Json | null
          derive?: boolean | null
          event_code?: number
          label?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      event_code_occurrences: {
        Row: {
          assists: number | null
          count: number
          created_at: string | null
          discord_user_id: string | null
          ea_match_id: string
          ea_username: string
          event_code: number
          goals: number | null
          guild_id: string
          id: string
          pass_attempts: number | null
          passes_made: number | null
          position_played: string | null
          rating: number | null
          saves: number | null
          shots: number | null
          tackles: number | null
        }
        Insert: {
          assists?: number | null
          count?: number
          created_at?: string | null
          discord_user_id?: string | null
          ea_match_id: string
          ea_username: string
          event_code: number
          goals?: number | null
          guild_id: string
          id?: string
          pass_attempts?: number | null
          passes_made?: number | null
          position_played?: string | null
          rating?: number | null
          saves?: number | null
          shots?: number | null
          tackles?: number | null
        }
        Update: {
          assists?: number | null
          count?: number
          created_at?: string | null
          discord_user_id?: string | null
          ea_match_id?: string
          ea_username?: string
          event_code?: number
          goals?: number | null
          guild_id?: string
          id?: string
          pass_attempts?: number | null
          passes_made?: number | null
          position_played?: string | null
          rating?: number | null
          saves?: number | null
          shots?: number | null
          tackles?: number | null
        }
        Relationships: []
      }
      event_presets: {
        Row: {
          channel_id: string | null
          club_key: string | null
          created_at: string
          created_by_discord_id: string
          deadline_minutes: number | null
          description: string | null
          duration_minutes: number
          event_type: string
          guild_id: string
          id: string
          name: string
          ping_role_id: string | null
          position_signup: boolean
          time_of_day: string | null
          title: string
          weekday: number | null
        }
        Insert: {
          channel_id?: string | null
          club_key?: string | null
          created_at?: string
          created_by_discord_id: string
          deadline_minutes?: number | null
          description?: string | null
          duration_minutes?: number
          event_type?: string
          guild_id: string
          id?: string
          name: string
          ping_role_id?: string | null
          position_signup?: boolean
          time_of_day?: string | null
          title: string
          weekday?: number | null
        }
        Update: {
          channel_id?: string | null
          club_key?: string | null
          created_at?: string
          created_by_discord_id?: string
          deadline_minutes?: number | null
          description?: string | null
          duration_minutes?: number
          event_type?: string
          guild_id?: string
          id?: string
          name?: string
          ping_role_id?: string | null
          position_signup?: boolean
          time_of_day?: string | null
          title?: string
          weekday?: number | null
        }
        Relationships: []
      }
      event_series: {
        Row: {
          active: boolean
          channel_id: string
          club_key: string | null
          created_at: string
          created_by_discord_id: string
          deadline_minutes: number | null
          description: string | null
          duration_minutes: number
          event_type: string
          guild_id: string
          id: string
          interval_weeks: number
          next_at: string
          ping_role_id: string | null
          position_signup: boolean
          post_hours_before: number
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_id: string
          club_key?: string | null
          created_at?: string
          created_by_discord_id: string
          deadline_minutes?: number | null
          description?: string | null
          duration_minutes?: number
          event_type?: string
          guild_id: string
          id?: string
          interval_weeks?: number
          next_at: string
          ping_role_id?: string | null
          position_signup?: boolean
          post_hours_before?: number
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_id?: string
          club_key?: string | null
          created_at?: string
          created_by_discord_id?: string
          deadline_minutes?: number | null
          description?: string | null
          duration_minutes?: number
          event_type?: string
          guild_id?: string
          id?: string
          interval_weeks?: number
          next_at?: string
          ping_role_id?: string | null
          position_signup?: boolean
          post_hours_before?: number
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      free_agents: {
        Row: {
          created_at: string
          discord_user_id: string
          ea_username: string | null
          ea_verified: boolean
          home_guild_id: string | null
          id: string
          no_contact: boolean
          notes: string | null
          platform: string | null
          position: string
          secondary_position: string | null
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discord_user_id: string
          ea_username?: string | null
          ea_verified?: boolean
          home_guild_id?: string | null
          id?: string
          no_contact?: boolean
          notes?: string | null
          platform?: string | null
          position: string
          secondary_position?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discord_user_id?: string
          ea_username?: string | null
          ea_verified?: boolean
          home_guild_id?: string | null
          id?: string
          no_contact?: boolean
          notes?: string | null
          platform?: string | null
          position?: string
          secondary_position?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      global_league_challenges: {
        Row: {
          accepted_time: string | null
          challenged_club_id: string | null
          challenger_club_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          match_id: string | null
          message: string | null
          proposed_times: Json | null
          responded_at: string | null
          status: string | null
        }
        Insert: {
          accepted_time?: string | null
          challenged_club_id?: string | null
          challenger_club_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          match_id?: string | null
          message?: string | null
          proposed_times?: Json | null
          responded_at?: string | null
          status?: string | null
        }
        Update: {
          accepted_time?: string | null
          challenged_club_id?: string | null
          challenger_club_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          match_id?: string | null
          message?: string | null
          proposed_times?: Json | null
          responded_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "global_league_challenges_challenged_club_id_fkey"
            columns: ["challenged_club_id"]
            isOneToOne: false
            referencedRelation: "global_league_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_league_challenges_challenger_club_id_fkey"
            columns: ["challenger_club_id"]
            isOneToOne: false
            referencedRelation: "global_league_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_league_challenges_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "global_league_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      global_league_clubs: {
        Row: {
          club_key: string
          club_name: string
          created_at: string | null
          current_streak: number | null
          draws: number | null
          ea_club_id: string
          ea_platform: string
          elo_rating: number | null
          goals_against: number | null
          goals_for: number | null
          guild_id: string
          guild_name: string | null
          id: string
          last_match_at: string | null
          lfg_expires_at: string | null
          lfg_message: string | null
          lfg_status: string | null
          lfg_updated_at: string | null
          losses: number | null
          matches_played: number | null
          peak_elo: number | null
          registered_by_discord_id: string
          status: string | null
          updated_at: string | null
          wins: number | null
        }
        Insert: {
          club_key: string
          club_name: string
          created_at?: string | null
          current_streak?: number | null
          draws?: number | null
          ea_club_id: string
          ea_platform: string
          elo_rating?: number | null
          goals_against?: number | null
          goals_for?: number | null
          guild_id: string
          guild_name?: string | null
          id?: string
          last_match_at?: string | null
          lfg_expires_at?: string | null
          lfg_message?: string | null
          lfg_status?: string | null
          lfg_updated_at?: string | null
          losses?: number | null
          matches_played?: number | null
          peak_elo?: number | null
          registered_by_discord_id: string
          status?: string | null
          updated_at?: string | null
          wins?: number | null
        }
        Update: {
          club_key?: string
          club_name?: string
          created_at?: string | null
          current_streak?: number | null
          draws?: number | null
          ea_club_id?: string
          ea_platform?: string
          elo_rating?: number | null
          goals_against?: number | null
          goals_for?: number | null
          guild_id?: string
          guild_name?: string | null
          id?: string
          last_match_at?: string | null
          lfg_expires_at?: string | null
          lfg_message?: string | null
          lfg_status?: string | null
          lfg_updated_at?: string | null
          losses?: number | null
          matches_played?: number | null
          peak_elo?: number | null
          registered_by_discord_id?: string
          status?: string | null
          updated_at?: string | null
          wins?: number | null
        }
        Relationships: []
      }
      global_league_matches: {
        Row: {
          away_club_id: string | null
          away_elo_before: number | null
          away_elo_change: number | null
          away_score: number | null
          completed_at: string | null
          confirmed_by_discord_id: string | null
          created_at: string | null
          ea_match_id: string | null
          home_club_id: string | null
          home_elo_before: number | null
          home_elo_change: number | null
          home_score: number | null
          id: string
          notes: string | null
          scheduled_at: string
          scheduled_by_discord_id: string
          status: string | null
          winner_club_id: string | null
        }
        Insert: {
          away_club_id?: string | null
          away_elo_before?: number | null
          away_elo_change?: number | null
          away_score?: number | null
          completed_at?: string | null
          confirmed_by_discord_id?: string | null
          created_at?: string | null
          ea_match_id?: string | null
          home_club_id?: string | null
          home_elo_before?: number | null
          home_elo_change?: number | null
          home_score?: number | null
          id?: string
          notes?: string | null
          scheduled_at: string
          scheduled_by_discord_id: string
          status?: string | null
          winner_club_id?: string | null
        }
        Update: {
          away_club_id?: string | null
          away_elo_before?: number | null
          away_elo_change?: number | null
          away_score?: number | null
          completed_at?: string | null
          confirmed_by_discord_id?: string | null
          created_at?: string | null
          ea_match_id?: string | null
          home_club_id?: string | null
          home_elo_before?: number | null
          home_elo_change?: number | null
          home_score?: number | null
          id?: string
          notes?: string | null
          scheduled_at?: string
          scheduled_by_discord_id?: string
          status?: string | null
          winner_club_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "global_league_matches_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "global_league_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_league_matches_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "global_league_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_league_matches_winner_club_id_fkey"
            columns: ["winner_club_id"]
            isOneToOne: false
            referencedRelation: "global_league_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      global_league_matches_archive: {
        Row: {
          away_club_id: string | null
          away_elo_before: number | null
          away_elo_change: number | null
          away_score: number | null
          completed_at: string | null
          confirmed_by_discord_id: string | null
          created_at: string | null
          ea_match_id: string | null
          home_club_id: string | null
          home_elo_before: number | null
          home_elo_change: number | null
          home_score: number | null
          id: string
          notes: string | null
          scheduled_at: string
          scheduled_by_discord_id: string
          status: string | null
          winner_club_id: string | null
        }
        Insert: {
          away_club_id?: string | null
          away_elo_before?: number | null
          away_elo_change?: number | null
          away_score?: number | null
          completed_at?: string | null
          confirmed_by_discord_id?: string | null
          created_at?: string | null
          ea_match_id?: string | null
          home_club_id?: string | null
          home_elo_before?: number | null
          home_elo_change?: number | null
          home_score?: number | null
          id?: string
          notes?: string | null
          scheduled_at: string
          scheduled_by_discord_id: string
          status?: string | null
          winner_club_id?: string | null
        }
        Update: {
          away_club_id?: string | null
          away_elo_before?: number | null
          away_elo_change?: number | null
          away_score?: number | null
          completed_at?: string | null
          confirmed_by_discord_id?: string | null
          created_at?: string | null
          ea_match_id?: string | null
          home_club_id?: string | null
          home_elo_before?: number | null
          home_elo_change?: number | null
          home_score?: number | null
          id?: string
          notes?: string | null
          scheduled_at?: string
          scheduled_by_discord_id?: string
          status?: string | null
          winner_club_id?: string | null
        }
        Relationships: []
      }
      guild_queues: {
        Row: {
          club_key: string
          guild_id: string
          id: string
          slot_index: number
          updated_at: string
          user_ids: string[]
        }
        Insert: {
          club_key: string
          guild_id: string
          id?: string
          slot_index: number
          updated_at?: string
          user_ids?: string[]
        }
        Update: {
          club_key?: string
          guild_id?: string
          id?: string
          slot_index?: number
          updated_at?: string
          user_ids?: string[]
        }
        Relationships: []
      }
      guild_settings: {
        Row: {
          admin_panel_channel_id: string | null
          admin_panel_message_id: string | null
          board_state: Json
          branding: Json
          club_vc_links: Json
          clubs: Json
          created_at: string
          current_club_key: string
          feedback_enabled: boolean
          guild_id: string
          id: string
          link_dm_enabled: boolean | null
          name: string | null
          timezone: string
          updated_at: string
          vc_panels: Json
        }
        Insert: {
          admin_panel_channel_id?: string | null
          admin_panel_message_id?: string | null
          board_state?: Json
          branding?: Json
          club_vc_links?: Json
          clubs?: Json
          created_at?: string
          current_club_key?: string
          feedback_enabled?: boolean
          guild_id: string
          id?: string
          link_dm_enabled?: boolean | null
          name?: string | null
          timezone?: string
          updated_at?: string
          vc_panels?: Json
        }
        Update: {
          admin_panel_channel_id?: string | null
          admin_panel_message_id?: string | null
          board_state?: Json
          branding?: Json
          club_vc_links?: Json
          clubs?: Json
          created_at?: string
          current_club_key?: string
          feedback_enabled?: boolean
          guild_id?: string
          id?: string
          link_dm_enabled?: boolean | null
          name?: string | null
          timezone?: string
          updated_at?: string
          vc_panels?: Json
        }
        Relationships: []
      }
      lineup_slots: {
        Row: {
          discord_user_id: string
          id: string
          is_substitute: boolean
          lineup_id: string
          position: string
          slot_index: number
        }
        Insert: {
          discord_user_id: string
          id?: string
          is_substitute?: boolean
          lineup_id: string
          position: string
          slot_index: number
        }
        Update: {
          discord_user_id?: string
          id?: string
          is_substitute?: boolean
          lineup_id?: string
          position?: string
          slot_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineup_slots_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          announced_slots: Json | null
          channel_id: string | null
          created_at: string
          created_by_discord_id: string
          event_id: string | null
          formation: string
          guild_id: string
          id: string
          image_url: string | null
          message_id: string | null
          name: string | null
          share_code: string | null
          team_avg_rating: number | null
          team_id: string | null
          updated_at: string
          vibe_chemistry_score: number | null
          win_probability: number | null
        }
        Insert: {
          announced_slots?: Json | null
          channel_id?: string | null
          created_at?: string
          created_by_discord_id: string
          event_id?: string | null
          formation?: string
          guild_id: string
          id?: string
          image_url?: string | null
          message_id?: string | null
          name?: string | null
          share_code?: string | null
          team_avg_rating?: number | null
          team_id?: string | null
          updated_at?: string
          vibe_chemistry_score?: number | null
          win_probability?: number | null
        }
        Update: {
          announced_slots?: Json | null
          channel_id?: string | null
          created_at?: string
          created_by_discord_id?: string
          event_id?: string | null
          formation?: string
          guild_id?: string
          id?: string
          image_url?: string | null
          message_id?: string | null
          name?: string | null
          share_code?: string | null
          team_avg_rating?: number | null
          team_id?: string | null
          updated_at?: string
          vibe_chemistry_score?: number | null
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lineups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "availability_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      link_suggestions: {
        Row: {
          created_at: string
          ea_username: string
          guild_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          similarity_score: number
          status: string
          suggested_discord_id: string
          suggested_discord_name: string | null
          temp_profile_id: string
        }
        Insert: {
          created_at?: string
          ea_username: string
          guild_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_score: number
          status?: string
          suggested_discord_id: string
          suggested_discord_name?: string | null
          temp_profile_id: string
        }
        Update: {
          created_at?: string
          ea_username?: string
          guild_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_score?: number
          status?: string
          suggested_discord_id?: string
          suggested_discord_name?: string | null
          temp_profile_id?: string
        }
        Relationships: []
      }
      manager_evaluations: {
        Row: {
          aerial_ability: number | null
          club_match_id: string | null
          command_of_area: number | null
          created_at: string
          creativity: number | null
          defensive_awareness: number | null
          defensive_positioning: number | null
          distribution: number | null
          draft_id: string | null
          dribbling: number | null
          evaluated_discord_id: string
          evaluator_discord_id: string
          evaluator_role: string
          gk_positioning: number | null
          guild_id: string
          handling: number | null
          id: string
          marking: number | null
          notes: string | null
          off_ball_movement: number | null
          one_on_ones: number | null
          overall_performance: number
          pace: number | null
          passing: number | null
          position_played: string
          shooting: number | null
          shot_stopping: number | null
          strength: number | null
          tackling: number | null
          trust_weight: number | null
          weighted_score: number | null
        }
        Insert: {
          aerial_ability?: number | null
          club_match_id?: string | null
          command_of_area?: number | null
          created_at?: string
          creativity?: number | null
          defensive_awareness?: number | null
          defensive_positioning?: number | null
          distribution?: number | null
          draft_id?: string | null
          dribbling?: number | null
          evaluated_discord_id: string
          evaluator_discord_id: string
          evaluator_role: string
          gk_positioning?: number | null
          guild_id: string
          handling?: number | null
          id?: string
          marking?: number | null
          notes?: string | null
          off_ball_movement?: number | null
          one_on_ones?: number | null
          overall_performance: number
          pace?: number | null
          passing?: number | null
          position_played: string
          shooting?: number | null
          shot_stopping?: number | null
          strength?: number | null
          tackling?: number | null
          trust_weight?: number | null
          weighted_score?: number | null
        }
        Update: {
          aerial_ability?: number | null
          club_match_id?: string | null
          command_of_area?: number | null
          created_at?: string
          creativity?: number | null
          defensive_awareness?: number | null
          defensive_positioning?: number | null
          distribution?: number | null
          draft_id?: string | null
          dribbling?: number | null
          evaluated_discord_id?: string
          evaluator_discord_id?: string
          evaluator_role?: string
          gk_positioning?: number | null
          guild_id?: string
          handling?: number | null
          id?: string
          marking?: number | null
          notes?: string | null
          off_ball_movement?: number | null
          one_on_ones?: number | null
          overall_performance?: number
          pace?: number | null
          passing?: number | null
          position_played?: string
          shooting?: number | null
          shot_stopping?: number | null
          strength?: number | null
          tackling?: number | null
          trust_weight?: number | null
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_evaluations_club_match_id_fkey"
            columns: ["club_match_id"]
            isOneToOne: false
            referencedRelation: "club_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_evaluations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_snapshots: {
        Row: {
          assists: number
          created_at: string
          discord_user_id: string
          games_played: number
          goals: number
          guild_id: string
          id: string
          month_year: string
          overall_rating: number
          rank_position: number | null
          wins: number
        }
        Insert: {
          assists?: number
          created_at?: string
          discord_user_id: string
          games_played?: number
          goals?: number
          guild_id: string
          id?: string
          month_year: string
          overall_rating: number
          rank_position?: number | null
          wins?: number
        }
        Update: {
          assists?: number
          created_at?: string
          discord_user_id?: string
          games_played?: number
          goals?: number
          guild_id?: string
          id?: string
          month_year?: string
          overall_rating?: number
          rank_position?: number | null
          wins?: number
        }
        Relationships: []
      }
      peer_evaluations: {
        Row: {
          club_match_id: string | null
          clutch_factor: number | null
          communication: number | null
          consistency: number | null
          created_at: string
          defensive_skill: number | null
          draft_id: string | null
          enjoyment: number | null
          evaluated_discord_id: string
          evaluator_discord_id: string
          game_iq: number | null
          goal_scoring: number | null
          guild_id: string
          id: string
          overall_score: number | null
          passing_skill: number | null
          play_again: string | null
          position_played: string | null
          team_energy: number | null
          technical_skill: number | null
          trust_weighted_score: number | null
          work_ethic: number | null
        }
        Insert: {
          club_match_id?: string | null
          clutch_factor?: number | null
          communication?: number | null
          consistency?: number | null
          created_at?: string
          defensive_skill?: number | null
          draft_id?: string | null
          enjoyment?: number | null
          evaluated_discord_id: string
          evaluator_discord_id: string
          game_iq?: number | null
          goal_scoring?: number | null
          guild_id: string
          id?: string
          overall_score?: number | null
          passing_skill?: number | null
          play_again?: string | null
          position_played?: string | null
          team_energy?: number | null
          technical_skill?: number | null
          trust_weighted_score?: number | null
          work_ethic?: number | null
        }
        Update: {
          club_match_id?: string | null
          clutch_factor?: number | null
          communication?: number | null
          consistency?: number | null
          created_at?: string
          defensive_skill?: number | null
          draft_id?: string | null
          enjoyment?: number | null
          evaluated_discord_id?: string
          evaluator_discord_id?: string
          game_iq?: number | null
          goal_scoring?: number | null
          guild_id?: string
          id?: string
          overall_score?: number | null
          passing_skill?: number | null
          play_again?: string | null
          position_played?: string | null
          team_energy?: number | null
          technical_skill?: number | null
          trust_weighted_score?: number | null
          work_ethic?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "peer_evaluations_club_match_id_fkey"
            columns: ["club_match_id"]
            isOneToOne: false
            referencedRelation: "club_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_evaluations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_win_claims: {
        Row: {
          claimed_by_discord_id: string
          competition_name: string
          competition_type: Database["public"]["Enums"]["competition_type"]
          created_at: string
          guild_id: string
          id: string
          placed_at: string | null
          proof_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by_discord_id: string | null
          status: Database["public"]["Enums"]["verification_status"]
          team_name: string | null
          tier: Database["public"]["Enums"]["competition_tier"]
        }
        Insert: {
          claimed_by_discord_id: string
          competition_name: string
          competition_type: Database["public"]["Enums"]["competition_type"]
          created_at?: string
          guild_id: string
          id?: string
          placed_at?: string | null
          proof_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_discord_id?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          team_name?: string | null
          tier: Database["public"]["Enums"]["competition_tier"]
        }
        Update: {
          claimed_by_discord_id?: string
          competition_name?: string
          competition_type?: Database["public"]["Enums"]["competition_type"]
          created_at?: string
          guild_id?: string
          id?: string
          placed_at?: string | null
          proof_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_discord_id?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          team_name?: string | null
          tier?: Database["public"]["Enums"]["competition_tier"]
        }
        Relationships: []
      }
      player_achievements: {
        Row: {
          achievement_icon: string
          achievement_key: string
          achievement_name: string
          context: Json | null
          discord_user_id: string
          earned_at: string
          guild_id: string
          id: string
        }
        Insert: {
          achievement_icon: string
          achievement_key: string
          achievement_name: string
          context?: Json | null
          discord_user_id: string
          earned_at?: string
          guild_id: string
          id?: string
        }
        Update: {
          achievement_icon?: string
          achievement_key?: string
          achievement_name?: string
          context?: Json | null
          discord_user_id?: string
          earned_at?: string
          guild_id?: string
          id?: string
        }
        Relationships: []
      }
      player_availability: {
        Row: {
          auto_marked: boolean
          discord_user_id: string
          event_id: string
          id: string
          note: string | null
          position: string | null
          responded_at: string | null
          response: Database["public"]["Enums"]["availability_response"]
        }
        Insert: {
          auto_marked?: boolean
          discord_user_id: string
          event_id: string
          id?: string
          note?: string | null
          position?: string | null
          responded_at?: string | null
          response?: Database["public"]["Enums"]["availability_response"]
        }
        Update: {
          auto_marked?: boolean
          discord_user_id?: string
          event_id?: string
          id?: string
          note?: string | null
          position?: string | null
          responded_at?: string | null
          response?: Database["public"]["Enums"]["availability_response"]
        }
        Relationships: [
          {
            foreignKeyName: "player_availability_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "availability_events"
            referencedColumns: ["id"]
          },
        ]
      }
      player_build_profiles: {
        Row: {
          build_rating: number | null
          created_at: string
          discord_user_id: string
          guild_id: string
          height_cm: number | null
          id: string
          playstyles: string[] | null
          playstyles_plus: string[] | null
          position: string
          screenshot_url: string | null
          updated_at: string
          verified: boolean
          weight_kg: number | null
        }
        Insert: {
          build_rating?: number | null
          created_at?: string
          discord_user_id: string
          guild_id: string
          height_cm?: number | null
          id?: string
          playstyles?: string[] | null
          playstyles_plus?: string[] | null
          position: string
          screenshot_url?: string | null
          updated_at?: string
          verified?: boolean
          weight_kg?: number | null
        }
        Update: {
          build_rating?: number | null
          created_at?: string
          discord_user_id?: string
          guild_id?: string
          height_cm?: number | null
          id?: string
          playstyles?: string[] | null
          playstyles_plus?: string[] | null
          position?: string
          screenshot_url?: string | null
          updated_at?: string
          verified?: boolean
          weight_kg?: number | null
        }
        Relationships: []
      }
      player_chemistry: {
        Row: {
          draws_together: number
          games_together: number
          guild_id: string
          id: string
          last_played_together: string | null
          losses_together: number
          player_a_discord_id: string
          player_b_discord_id: string
          synergy_score: number | null
          updated_at: string
          win_rate: number
          wins_together: number
        }
        Insert: {
          draws_together?: number
          games_together?: number
          guild_id: string
          id?: string
          last_played_together?: string | null
          losses_together?: number
          player_a_discord_id: string
          player_b_discord_id: string
          synergy_score?: number | null
          updated_at?: string
          win_rate?: number
          wins_together?: number
        }
        Update: {
          draws_together?: number
          games_together?: number
          guild_id?: string
          id?: string
          last_played_together?: string | null
          losses_together?: number
          player_a_discord_id?: string
          player_b_discord_id?: string
          synergy_score?: number | null
          updated_at?: string
          win_rate?: number
          wins_together?: number
        }
        Relationships: []
      }
      player_club_stats: {
        Row: {
          archetypeid: string | null
          assists: number | null
          avg_match_rating: number | null
          ball_recoveries: number | null
          baseline_synced: boolean | null
          big_chances: number | null
          clean_sheets: number | null
          clearances: number | null
          club_key: string
          created_at: string
          defensive_actions: number | null
          defensive_duels: number | null
          discord_user_id: string
          discord_username: string | null
          draws: number | null
          dribble_attempts: number | null
          dribble_success: number | null
          dribbles: number | null
          ea_club_id: string | null
          forward_passes: number | null
          forward_runs: number | null
          fouls: number | null
          games_played: number | null
          gk_claims: number | null
          goals: number | null
          goals_conceded: number | null
          goals_inside_box: number | null
          guild_id: string
          id: string
          interceptions: number | null
          losses: number | null
          man_of_match: number | null
          offensive_duels: number | null
          offsides: number | null
          pass_attempts: number | null
          passes_completed: number | null
          passes_made: number | null
          possession_gains: number | null
          pressing_actions: number | null
          primary_position: string | null
          progressive_carries: number | null
          saves: number | null
          saves_cross: number | null
          saves_diving: number | null
          saves_parry: number | null
          saves_punch: number | null
          saves_reflex: number | null
          second_assists: number | null
          seconds_played: number | null
          shots: number | null
          shots_off_target: number | null
          shots_on_target: number | null
          tackle_attempts: number | null
          tackle_success: number | null
          tackles: number | null
          through_balls: number | null
          touches_in_box: number | null
          updated_at: string
          win_rate: number | null
          wins: number | null
        }
        Insert: {
          archetypeid?: string | null
          assists?: number | null
          avg_match_rating?: number | null
          ball_recoveries?: number | null
          baseline_synced?: boolean | null
          big_chances?: number | null
          clean_sheets?: number | null
          clearances?: number | null
          club_key: string
          created_at?: string
          defensive_actions?: number | null
          defensive_duels?: number | null
          discord_user_id: string
          discord_username?: string | null
          draws?: number | null
          dribble_attempts?: number | null
          dribble_success?: number | null
          dribbles?: number | null
          ea_club_id?: string | null
          forward_passes?: number | null
          forward_runs?: number | null
          fouls?: number | null
          games_played?: number | null
          gk_claims?: number | null
          goals?: number | null
          goals_conceded?: number | null
          goals_inside_box?: number | null
          guild_id: string
          id?: string
          interceptions?: number | null
          losses?: number | null
          man_of_match?: number | null
          offensive_duels?: number | null
          offsides?: number | null
          pass_attempts?: number | null
          passes_completed?: number | null
          passes_made?: number | null
          possession_gains?: number | null
          pressing_actions?: number | null
          primary_position?: string | null
          progressive_carries?: number | null
          saves?: number | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          second_assists?: number | null
          seconds_played?: number | null
          shots?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          tackle_attempts?: number | null
          tackle_success?: number | null
          tackles?: number | null
          through_balls?: number | null
          touches_in_box?: number | null
          updated_at?: string
          win_rate?: number | null
          wins?: number | null
        }
        Update: {
          archetypeid?: string | null
          assists?: number | null
          avg_match_rating?: number | null
          ball_recoveries?: number | null
          baseline_synced?: boolean | null
          big_chances?: number | null
          clean_sheets?: number | null
          clearances?: number | null
          club_key?: string
          created_at?: string
          defensive_actions?: number | null
          defensive_duels?: number | null
          discord_user_id?: string
          discord_username?: string | null
          draws?: number | null
          dribble_attempts?: number | null
          dribble_success?: number | null
          dribbles?: number | null
          ea_club_id?: string | null
          forward_passes?: number | null
          forward_runs?: number | null
          fouls?: number | null
          games_played?: number | null
          gk_claims?: number | null
          goals?: number | null
          goals_conceded?: number | null
          goals_inside_box?: number | null
          guild_id?: string
          id?: string
          interceptions?: number | null
          losses?: number | null
          man_of_match?: number | null
          offensive_duels?: number | null
          offsides?: number | null
          pass_attempts?: number | null
          passes_completed?: number | null
          passes_made?: number | null
          possession_gains?: number | null
          pressing_actions?: number | null
          primary_position?: string | null
          progressive_carries?: number | null
          saves?: number | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          second_assists?: number | null
          seconds_played?: number | null
          shots?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          tackle_attempts?: number | null
          tackle_success?: number | null
          tackles?: number | null
          through_balls?: number | null
          touches_in_box?: number | null
          updated_at?: string
          win_rate?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      player_position_ratings: {
        Row: {
          assists_at_position: number
          avg_match_rating: number | null
          discord_user_id: string
          games_at_position: number
          goals_at_position: number
          guild_id: string
          id: string
          position: string
          rating: number
          updated_at: string
        }
        Insert: {
          assists_at_position?: number
          avg_match_rating?: number | null
          discord_user_id: string
          games_at_position?: number
          goals_at_position?: number
          guild_id: string
          id?: string
          position: string
          rating?: number
          updated_at?: string
        }
        Update: {
          assists_at_position?: number
          avg_match_rating?: number | null
          discord_user_id?: string
          games_at_position?: number
          goals_at_position?: number
          guild_id?: string
          id?: string
          position?: string
          rating?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_ratings: {
        Row: {
          avg_match_rating: number | null
          ball_recoveries: number | null
          baseline_synced: boolean | null
          big_chances: number | null
          build_quality_rating: number | null
          clearances: number | null
          club_performance_rating: number | null
          created_at: string
          defensive_actions: number | null
          defensive_duels: number | null
          discord_user_id: string
          draft_performance_rating: number | null
          draws: number
          dribble_attempts: number | null
          dribble_success: number | null
          dribbles: number | null
          forward_passes: number | null
          forward_runs: number | null
          fouls: number | null
          games_played: number
          gk_claims: number | null
          goals_conceded: number | null
          goals_inside_box: number | null
          guild_id: string
          id: string
          interceptions: number | null
          last_calculated_at: string
          last_game_at: string | null
          losses: number
          manager_rating: number | null
          offensive_duels: number | null
          offsides: number | null
          overall_rating: number
          pass_attempts: number | null
          passes_completed: number | null
          passes_made: number | null
          peer_rating: number | null
          possession_gains: number | null
          pressing_actions: number | null
          progressive_carries: number | null
          saves: number | null
          saves_cross: number | null
          saves_diving: number | null
          saves_parry: number | null
          saves_punch: number | null
          saves_reflex: number | null
          shots: number | null
          shots_off_target: number | null
          shots_on_target: number | null
          tackle_attempts: number | null
          tackle_success: number | null
          tackles: number | null
          through_balls: number | null
          total_assists: number
          total_clean_sheets: number
          total_goals: number
          total_motm: number
          total_second_assists: number | null
          touches_in_box: number | null
          updated_at: string
          wins: number
        }
        Insert: {
          avg_match_rating?: number | null
          ball_recoveries?: number | null
          baseline_synced?: boolean | null
          big_chances?: number | null
          build_quality_rating?: number | null
          clearances?: number | null
          club_performance_rating?: number | null
          created_at?: string
          defensive_actions?: number | null
          defensive_duels?: number | null
          discord_user_id: string
          draft_performance_rating?: number | null
          draws?: number
          dribble_attempts?: number | null
          dribble_success?: number | null
          dribbles?: number | null
          forward_passes?: number | null
          forward_runs?: number | null
          fouls?: number | null
          games_played?: number
          gk_claims?: number | null
          goals_conceded?: number | null
          goals_inside_box?: number | null
          guild_id: string
          id?: string
          interceptions?: number | null
          last_calculated_at?: string
          last_game_at?: string | null
          losses?: number
          manager_rating?: number | null
          offensive_duels?: number | null
          offsides?: number | null
          overall_rating?: number
          pass_attempts?: number | null
          passes_completed?: number | null
          passes_made?: number | null
          peer_rating?: number | null
          possession_gains?: number | null
          pressing_actions?: number | null
          progressive_carries?: number | null
          saves?: number | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          shots?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          tackle_attempts?: number | null
          tackle_success?: number | null
          tackles?: number | null
          through_balls?: number | null
          total_assists?: number
          total_clean_sheets?: number
          total_goals?: number
          total_motm?: number
          total_second_assists?: number | null
          touches_in_box?: number | null
          updated_at?: string
          wins?: number
        }
        Update: {
          avg_match_rating?: number | null
          ball_recoveries?: number | null
          baseline_synced?: boolean | null
          big_chances?: number | null
          build_quality_rating?: number | null
          clearances?: number | null
          club_performance_rating?: number | null
          created_at?: string
          defensive_actions?: number | null
          defensive_duels?: number | null
          discord_user_id?: string
          draft_performance_rating?: number | null
          draws?: number
          dribble_attempts?: number | null
          dribble_success?: number | null
          dribbles?: number | null
          forward_passes?: number | null
          forward_runs?: number | null
          fouls?: number | null
          games_played?: number
          gk_claims?: number | null
          goals_conceded?: number | null
          goals_inside_box?: number | null
          guild_id?: string
          id?: string
          interceptions?: number | null
          last_calculated_at?: string
          last_game_at?: string | null
          losses?: number
          manager_rating?: number | null
          offensive_duels?: number | null
          offsides?: number | null
          overall_rating?: number
          pass_attempts?: number | null
          passes_completed?: number | null
          passes_made?: number | null
          peer_rating?: number | null
          possession_gains?: number | null
          pressing_actions?: number | null
          progressive_carries?: number | null
          saves?: number | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          shots?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          tackle_attempts?: number | null
          tackle_success?: number | null
          tackles?: number | null
          through_balls?: number | null
          total_assists?: number
          total_clean_sheets?: number
          total_goals?: number
          total_motm?: number
          total_second_assists?: number | null
          touches_in_box?: number | null
          updated_at?: string
          wins?: number
        }
        Relationships: []
      }
      player_reliability: {
        Row: {
          discord_user_id: string
          events_available: number
          events_no_showed: number
          events_showed: number
          guild_id: string
          id: string
          reliability_score: number
          total_events: number
          updated_at: string
        }
        Insert: {
          discord_user_id: string
          events_available?: number
          events_no_showed?: number
          events_showed?: number
          guild_id: string
          id?: string
          reliability_score?: number
          total_events?: number
          updated_at?: string
        }
        Update: {
          discord_user_id?: string
          events_available?: number
          events_no_showed?: number
          events_showed?: number
          guild_id?: string
          id?: string
          reliability_score?: number
          total_events?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_resumes: {
        Row: {
          code: string
          created_at: string
          discord_user_id: string
          ea_username: string | null
          stats: Json
        }
        Insert: {
          code: string
          created_at?: string
          discord_user_id: string
          ea_username?: string | null
          stats: Json
        }
        Update: {
          code?: string
          created_at?: string
          discord_user_id?: string
          ea_username?: string | null
          stats?: Json
        }
        Relationships: []
      }
      player_stats: {
        Row: {
          archetypeid: string | null
          assists: number
          ball_recoveries: number | null
          big_chances: number | null
          clean_sheet: boolean | null
          clean_sheet_def: boolean | null
          clean_sheet_gk: boolean | null
          clearances: number | null
          created_at: string
          defensive_actions: number | null
          defensive_duels: number | null
          discord_user_id: string
          draft_id: string | null
          dribble_attempts: number | null
          dribble_success: number | null
          dribbles: number | null
          ea_match_id: string | null
          ea_match_rating: number | null
          forward_passes: number | null
          forward_runs: number | null
          fouls: number | null
          gk_claims: number | null
          goals: number
          goals_conceded: number | null
          goals_inside_box: number | null
          guild_id: string
          id: string
          interceptions: number | null
          man_of_match: boolean | null
          match_type: string
          offensive_duels: number | null
          offsides: number | null
          pass_attempts: number | null
          passes_completed: number | null
          passes_made: number | null
          position_played: string | null
          possession: number | null
          possession_gains: number | null
          pressing_actions: number | null
          progressive_carries: number | null
          recorded_at: string
          red_cards: boolean | null
          saves_cross: number | null
          saves_diving: number | null
          saves_parry: number | null
          saves_punch: number | null
          saves_reflex: number | null
          second_assists: number | null
          seconds_played: number | null
          shots: number | null
          shots_off_target: number | null
          shots_on_target: number | null
          tackle_attempts: number | null
          tackle_success: number | null
          tackles: number | null
          team: string | null
          through_balls: number | null
          touches_in_box: number | null
          won: boolean | null
        }
        Insert: {
          archetypeid?: string | null
          assists?: number
          ball_recoveries?: number | null
          big_chances?: number | null
          clean_sheet?: boolean | null
          clean_sheet_def?: boolean | null
          clean_sheet_gk?: boolean | null
          clearances?: number | null
          created_at?: string
          defensive_actions?: number | null
          defensive_duels?: number | null
          discord_user_id: string
          draft_id?: string | null
          dribble_attempts?: number | null
          dribble_success?: number | null
          dribbles?: number | null
          ea_match_id?: string | null
          ea_match_rating?: number | null
          forward_passes?: number | null
          forward_runs?: number | null
          fouls?: number | null
          gk_claims?: number | null
          goals?: number
          goals_conceded?: number | null
          goals_inside_box?: number | null
          guild_id: string
          id?: string
          interceptions?: number | null
          man_of_match?: boolean | null
          match_type?: string
          offensive_duels?: number | null
          offsides?: number | null
          pass_attempts?: number | null
          passes_completed?: number | null
          passes_made?: number | null
          position_played?: string | null
          possession?: number | null
          possession_gains?: number | null
          pressing_actions?: number | null
          progressive_carries?: number | null
          recorded_at?: string
          red_cards?: boolean | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          second_assists?: number | null
          seconds_played?: number | null
          shots?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          tackle_attempts?: number | null
          tackle_success?: number | null
          tackles?: number | null
          team?: string | null
          through_balls?: number | null
          touches_in_box?: number | null
          won?: boolean | null
        }
        Update: {
          archetypeid?: string | null
          assists?: number
          ball_recoveries?: number | null
          big_chances?: number | null
          clean_sheet?: boolean | null
          clean_sheet_def?: boolean | null
          clean_sheet_gk?: boolean | null
          clearances?: number | null
          created_at?: string
          defensive_actions?: number | null
          defensive_duels?: number | null
          discord_user_id?: string
          draft_id?: string | null
          dribble_attempts?: number | null
          dribble_success?: number | null
          dribbles?: number | null
          ea_match_id?: string | null
          ea_match_rating?: number | null
          forward_passes?: number | null
          forward_runs?: number | null
          fouls?: number | null
          gk_claims?: number | null
          goals?: number
          goals_conceded?: number | null
          goals_inside_box?: number | null
          guild_id?: string
          id?: string
          interceptions?: number | null
          man_of_match?: boolean | null
          match_type?: string
          offensive_duels?: number | null
          offsides?: number | null
          pass_attempts?: number | null
          passes_completed?: number | null
          passes_made?: number | null
          position_played?: string | null
          possession?: number | null
          possession_gains?: number | null
          pressing_actions?: number | null
          progressive_carries?: number | null
          recorded_at?: string
          red_cards?: boolean | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          second_assists?: number | null
          seconds_played?: number | null
          shots?: number | null
          shots_off_target?: number | null
          shots_on_target?: number | null
          tackle_attempts?: number | null
          tackle_success?: number | null
          tackles?: number | null
          team?: string | null
          through_balls?: number | null
          touches_in_box?: number | null
          won?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      player_streaks: {
        Row: {
          current_clean_sheet_streak: number
          current_goal_streak: number
          current_loss_streak: number
          current_win_streak: number
          discord_user_id: string
          form_rating: number | null
          guild_id: string
          id: string
          last_10_results: string[]
          last_5_results: string[]
          longest_clean_sheet_streak: number
          longest_goal_streak: number
          longest_loss_streak: number
          longest_win_streak: number
          updated_at: string
        }
        Insert: {
          current_clean_sheet_streak?: number
          current_goal_streak?: number
          current_loss_streak?: number
          current_win_streak?: number
          discord_user_id: string
          form_rating?: number | null
          guild_id: string
          id?: string
          last_10_results?: string[]
          last_5_results?: string[]
          longest_clean_sheet_streak?: number
          longest_goal_streak?: number
          longest_loss_streak?: number
          longest_win_streak?: number
          updated_at?: string
        }
        Update: {
          current_clean_sheet_streak?: number
          current_goal_streak?: number
          current_loss_streak?: number
          current_win_streak?: number
          discord_user_id?: string
          form_rating?: number | null
          guild_id?: string
          id?: string
          last_10_results?: string[]
          last_5_results?: string[]
          longest_clean_sheet_streak?: number
          longest_goal_streak?: number
          longest_loss_streak?: number
          longest_win_streak?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_summary: {
        Row: {
          achievement_count: number
          archetypeid: string | null
          assists: number
          avg_match_rating: number | null
          baseline_synced: boolean | null
          clean_sheets: number | null
          clearances: number | null
          current_streak: number
          discord_user_id: string
          discord_username: string | null
          draws: number | null
          dribble_attempts: number | null
          dribbles: number | null
          form_rating: number | null
          fouls: number | null
          games_played: number
          goals: number
          goals_conceded: number | null
          guild_id: string
          id: string
          interceptions: number | null
          last_active_at: string | null
          league_wins: number
          longest_win_streak: number
          losses: number | null
          major_wins: number
          man_of_match: number | null
          manager_rating: number | null
          offsides: number | null
          overall_rating: number
          pass_attempts: number | null
          passes_made: number | null
          possession: number | null
          primary_position: string | null
          reliability_score: number | null
          saves: number | null
          saves_cross: number | null
          saves_diving: number | null
          saves_parry: number | null
          saves_punch: number | null
          saves_reflex: number | null
          second_assists: number | null
          seconds_played: number | null
          shots: number | null
          streak_type: string | null
          tackle_attempts: number | null
          tackles: number | null
          top_achievements: string[]
          tournament_wins: number
          updated_at: string
          vibe_score: number | null
          win_rate: number
          wins: number
        }
        Insert: {
          achievement_count?: number
          archetypeid?: string | null
          assists?: number
          avg_match_rating?: number | null
          baseline_synced?: boolean | null
          clean_sheets?: number | null
          clearances?: number | null
          current_streak?: number
          discord_user_id: string
          discord_username?: string | null
          draws?: number | null
          dribble_attempts?: number | null
          dribbles?: number | null
          form_rating?: number | null
          fouls?: number | null
          games_played?: number
          goals?: number
          goals_conceded?: number | null
          guild_id: string
          id?: string
          interceptions?: number | null
          last_active_at?: string | null
          league_wins?: number
          longest_win_streak?: number
          losses?: number | null
          major_wins?: number
          man_of_match?: number | null
          manager_rating?: number | null
          offsides?: number | null
          overall_rating?: number
          pass_attempts?: number | null
          passes_made?: number | null
          possession?: number | null
          primary_position?: string | null
          reliability_score?: number | null
          saves?: number | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          second_assists?: number | null
          seconds_played?: number | null
          shots?: number | null
          streak_type?: string | null
          tackle_attempts?: number | null
          tackles?: number | null
          top_achievements?: string[]
          tournament_wins?: number
          updated_at?: string
          vibe_score?: number | null
          win_rate?: number
          wins?: number
        }
        Update: {
          achievement_count?: number
          archetypeid?: string | null
          assists?: number
          avg_match_rating?: number | null
          baseline_synced?: boolean | null
          clean_sheets?: number | null
          clearances?: number | null
          current_streak?: number
          discord_user_id?: string
          discord_username?: string | null
          draws?: number | null
          dribble_attempts?: number | null
          dribbles?: number | null
          form_rating?: number | null
          fouls?: number | null
          games_played?: number
          goals?: number
          goals_conceded?: number | null
          guild_id?: string
          id?: string
          interceptions?: number | null
          last_active_at?: string | null
          league_wins?: number
          longest_win_streak?: number
          losses?: number | null
          major_wins?: number
          man_of_match?: number | null
          manager_rating?: number | null
          offsides?: number | null
          overall_rating?: number
          pass_attempts?: number | null
          passes_made?: number | null
          possession?: number | null
          primary_position?: string | null
          reliability_score?: number | null
          saves?: number | null
          saves_cross?: number | null
          saves_diving?: number | null
          saves_parry?: number | null
          saves_punch?: number | null
          saves_reflex?: number | null
          second_assists?: number | null
          seconds_played?: number | null
          shots?: number | null
          streak_type?: string | null
          tackle_attempts?: number | null
          tackles?: number | null
          top_achievements?: string[]
          tournament_wins?: number
          updated_at?: string
          vibe_score?: number | null
          win_rate?: number
          wins?: number
        }
        Relationships: []
      }
      player_vibe_chemistry: {
        Row: {
          avg_enjoyment: number | null
          avg_team_energy: number | null
          avoid_count: number
          games_together: number
          guild_id: string
          id: string
          last_played_together: string | null
          neutral_count: number
          player_a_discord_id: string
          player_b_discord_id: string
          prefer_count: number
          updated_at: string
          vibe_score: number | null
          vibe_status: string | null
        }
        Insert: {
          avg_enjoyment?: number | null
          avg_team_energy?: number | null
          avoid_count?: number
          games_together?: number
          guild_id: string
          id?: string
          last_played_together?: string | null
          neutral_count?: number
          player_a_discord_id: string
          player_b_discord_id: string
          prefer_count?: number
          updated_at?: string
          vibe_score?: number | null
          vibe_status?: string | null
        }
        Update: {
          avg_enjoyment?: number | null
          avg_team_energy?: number | null
          avoid_count?: number
          games_together?: number
          guild_id?: string
          id?: string
          last_played_together?: string | null
          neutral_count?: number
          player_a_discord_id?: string
          player_b_discord_id?: string
          prefer_count?: number
          updated_at?: string
          vibe_score?: number | null
          vibe_status?: string | null
        }
        Relationships: []
      }
      position_preferences: {
        Row: {
          guild_id: string
          id: string
          preferences: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          guild_id: string
          id?: string
          preferences?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          guild_id?: string
          id?: string
          preferences?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          career_appearances: number | null
          career_assists: number | null
          career_goals: number | null
          created_at: string
          discord_avatar: string | null
          discord_user_id: string
          discord_username: string | null
          ea_persona_id: string | null
          ea_platform: string | null
          ea_username: string | null
          id: string
          link_dm_sent_at: string | null
          preferred_position: string | null
          primary_position: string | null
          updated_at: string
          xbox_gamertag: string | null
          xbox_last_game: string | null
          xbox_last_online: string | null
          xbox_xuid: string | null
        }
        Insert: {
          career_appearances?: number | null
          career_assists?: number | null
          career_goals?: number | null
          created_at?: string
          discord_avatar?: string | null
          discord_user_id: string
          discord_username?: string | null
          ea_persona_id?: string | null
          ea_platform?: string | null
          ea_username?: string | null
          id?: string
          link_dm_sent_at?: string | null
          preferred_position?: string | null
          primary_position?: string | null
          updated_at?: string
          xbox_gamertag?: string | null
          xbox_last_game?: string | null
          xbox_last_online?: string | null
          xbox_xuid?: string | null
        }
        Update: {
          career_appearances?: number | null
          career_assists?: number | null
          career_goals?: number | null
          created_at?: string
          discord_avatar?: string | null
          discord_user_id?: string
          discord_username?: string | null
          ea_persona_id?: string | null
          ea_platform?: string | null
          ea_username?: string | null
          id?: string
          link_dm_sent_at?: string | null
          preferred_position?: string | null
          primary_position?: string | null
          updated_at?: string
          xbox_gamertag?: string | null
          xbox_last_game?: string | null
          xbox_last_online?: string | null
          xbox_xuid?: string | null
        }
        Relationships: []
      }
      recruit_contacts: {
        Row: {
          club_key: string | null
          club_name: string | null
          created_at: string
          free_agent_id: string | null
          guild_id: string
          id: string
          invite_url: string | null
          manager_discord_id: string
          message: string | null
          player_discord_id: string
          position: string | null
          responded_at: string | null
          status: string
        }
        Insert: {
          club_key?: string | null
          club_name?: string | null
          created_at?: string
          free_agent_id?: string | null
          guild_id: string
          id?: string
          invite_url?: string | null
          manager_discord_id: string
          message?: string | null
          player_discord_id: string
          position?: string | null
          responded_at?: string | null
          status?: string
        }
        Update: {
          club_key?: string | null
          club_name?: string | null
          created_at?: string
          free_agent_id?: string | null
          guild_id?: string
          id?: string
          invite_url?: string | null
          manager_discord_id?: string
          message?: string | null
          player_discord_id?: string
          position?: string | null
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruit_contacts_free_agent_id_fkey"
            columns: ["free_agent_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      recruit_settings: {
        Row: {
          alert_min_rating: number
          alerts_enabled: boolean
          channel_id: string | null
          created_at: string
          guild_id: string
          invite_channel_id: string | null
          trialist_role_id: string | null
          updated_at: string
        }
        Insert: {
          alert_min_rating?: number
          alerts_enabled?: boolean
          channel_id?: string | null
          created_at?: string
          guild_id: string
          invite_channel_id?: string | null
          trialist_role_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_min_rating?: number
          alerts_enabled?: boolean
          channel_id?: string | null
          created_at?: string
          guild_id?: string
          invite_channel_id?: string | null
          trialist_role_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scout_watchlist: {
        Row: {
          added_by_discord_id: string
          club_key: string | null
          created_at: string
          discord_user_id: string | null
          ea_key: string
          ea_username: string
          guild_id: string
          id: string
          last_alert_at: string | null
          last_known_club_id: string | null
          last_known_club_name: string | null
          note: string | null
          position: string | null
          source: string
          source_match_id: string | null
        }
        Insert: {
          added_by_discord_id: string
          club_key?: string | null
          created_at?: string
          discord_user_id?: string | null
          ea_key: string
          ea_username: string
          guild_id: string
          id?: string
          last_alert_at?: string | null
          last_known_club_id?: string | null
          last_known_club_name?: string | null
          note?: string | null
          position?: string | null
          source?: string
          source_match_id?: string | null
        }
        Update: {
          added_by_discord_id?: string
          club_key?: string | null
          created_at?: string
          discord_user_id?: string | null
          ea_key?: string
          ea_username?: string
          guild_id?: string
          id?: string
          last_alert_at?: string | null
          last_known_club_id?: string | null
          last_known_club_name?: string | null
          note?: string | null
          position?: string | null
          source?: string
          source_match_id?: string | null
        }
        Relationships: []
      }
      scouted_players: {
        Row: {
          archetypeid: string | null
          assists: number | null
          avg_match_rating: number | null
          clean_sheets: number | null
          clearances: number | null
          created_at: string
          draws: number | null
          dribble_attempts: number | null
          ea_club_id: string
          ea_club_name: string | null
          ea_platform: string | null
          ea_username: string
          first_seen_at: string | null
          games_played: number | null
          goals: number | null
          guild_id: string
          id: string
          interceptions: number | null
          last_scouted_at: string | null
          losses: number | null
          man_of_match: number | null
          pass_attempts: number | null
          passes_made: number | null
          primary_position: string | null
          saves: number | null
          second_assists: number | null
          shots: number | null
          tackles: number | null
          times_faced: number | null
          updated_at: string
          win_rate: number | null
          wins: number | null
        }
        Insert: {
          archetypeid?: string | null
          assists?: number | null
          avg_match_rating?: number | null
          clean_sheets?: number | null
          clearances?: number | null
          created_at?: string
          draws?: number | null
          dribble_attempts?: number | null
          ea_club_id: string
          ea_club_name?: string | null
          ea_platform?: string | null
          ea_username: string
          first_seen_at?: string | null
          games_played?: number | null
          goals?: number | null
          guild_id: string
          id?: string
          interceptions?: number | null
          last_scouted_at?: string | null
          losses?: number | null
          man_of_match?: number | null
          pass_attempts?: number | null
          passes_made?: number | null
          primary_position?: string | null
          saves?: number | null
          second_assists?: number | null
          shots?: number | null
          tackles?: number | null
          times_faced?: number | null
          updated_at?: string
          win_rate?: number | null
          wins?: number | null
        }
        Update: {
          archetypeid?: string | null
          assists?: number | null
          avg_match_rating?: number | null
          clean_sheets?: number | null
          clearances?: number | null
          created_at?: string
          draws?: number | null
          dribble_attempts?: number | null
          ea_club_id?: string
          ea_club_name?: string | null
          ea_platform?: string | null
          ea_username?: string
          first_seen_at?: string | null
          games_played?: number | null
          goals?: number | null
          guild_id?: string
          id?: string
          interceptions?: number | null
          last_scouted_at?: string | null
          losses?: number | null
          man_of_match?: number | null
          pass_attempts?: number | null
          passes_made?: number | null
          primary_position?: string | null
          saves?: number | null
          second_assists?: number | null
          shots?: number | null
          tackles?: number | null
          times_faced?: number | null
          updated_at?: string
          win_rate?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      scouting_lists: {
        Row: {
          created_at: string
          created_by_discord_id: string
          description: string | null
          guild_id: string
          id: string
          is_public: boolean
          name: string
          player_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_discord_id: string
          description?: string | null
          guild_id: string
          id?: string
          is_public?: boolean
          name: string
          player_ids?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_discord_id?: string
          description?: string | null
          guild_id?: string
          id?: string
          is_public?: boolean
          name?: string
          player_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      scouting_reports: {
        Row: {
          created_at: string
          created_by_discord_id: string | null
          discord_user_id: string
          ea_username: string | null
          guild_id: string
          id: string
          player_data: Json | null
          report_content: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_discord_id?: string | null
          discord_user_id: string
          ea_username?: string | null
          guild_id: string
          id?: string
          player_data?: Json | null
          report_content: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_discord_id?: string | null
          discord_user_id?: string
          ea_username?: string | null
          guild_id?: string
          id?: string
          player_data?: Json | null
          report_content?: string
          updated_at?: string
        }
        Relationships: []
      }
      sub_requests: {
        Row: {
          channel_id: string | null
          created_at: string
          event_id: string | null
          filled_at: string | null
          filled_by_discord_id: string | null
          guild_id: string
          id: string
          lineup_id: string | null
          message_id: string | null
          position: string | null
          replacing_discord_id: string | null
          requested_by_discord_id: string
          status: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          event_id?: string | null
          filled_at?: string | null
          filled_by_discord_id?: string | null
          guild_id: string
          id?: string
          lineup_id?: string | null
          message_id?: string | null
          position?: string | null
          replacing_discord_id?: string | null
          requested_by_discord_id: string
          status?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          event_id?: string | null
          filled_at?: string | null
          filled_by_discord_id?: string | null
          guild_id?: string
          id?: string
          lineup_id?: string | null
          message_id?: string | null
          position?: string | null
          replacing_discord_id?: string | null
          requested_by_discord_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "availability_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_requests_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
        ]
      }
      team_rosters: {
        Row: {
          discord_user_id: string
          id: string
          joined_at: string
          note: string | null
          primary_position: string | null
          role: string
          secondary_position: string | null
          status: string
          team_id: string
        }
        Insert: {
          discord_user_id: string
          id?: string
          joined_at?: string
          note?: string | null
          primary_position?: string | null
          role?: string
          secondary_position?: string | null
          status?: string
          team_id: string
        }
        Update: {
          discord_user_id?: string
          id?: string
          joined_at?: string
          note?: string | null
          primary_position?: string | null
          role?: string
          secondary_position?: string | null
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          captain_discord_id: string | null
          created_at: string
          guild_id: string
          id: string
          logo_url: string | null
          manager_discord_ids: string[]
          name: string
          tag: string | null
          team_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          captain_discord_id?: string | null
          created_at?: string
          guild_id: string
          id?: string
          logo_url?: string | null
          manager_discord_ids?: string[]
          name: string
          tag?: string | null
          team_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          captain_discord_id?: string | null
          created_at?: string
          guild_id?: string
          id?: string
          logo_url?: string | null
          manager_discord_ids?: string[]
          name?: string
          tag?: string | null
          team_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournament_matches: {
        Row: {
          away_score: number | null
          away_team_id: string | null
          completed_at: string | null
          confirmed_by_discord_id: string | null
          created_at: string
          ea_match_id: string | null
          group_name: string | null
          home_score: number | null
          home_team_id: string | null
          id: string
          match_number: number | null
          next_match_id: string | null
          next_match_position: string | null
          reported_by_discord_id: string | null
          result_source: string | null
          round_number: number | null
          scheduled_at: string | null
          stage: string
          tournament_id: string
          updated_at: string
          winner_team_id: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id?: string | null
          completed_at?: string | null
          confirmed_by_discord_id?: string | null
          created_at?: string
          ea_match_id?: string | null
          group_name?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          match_number?: number | null
          next_match_id?: string | null
          next_match_position?: string | null
          reported_by_discord_id?: string | null
          result_source?: string | null
          round_number?: number | null
          scheduled_at?: string | null
          stage?: string
          tournament_id: string
          updated_at?: string
          winner_team_id?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string | null
          completed_at?: string | null
          confirmed_by_discord_id?: string | null
          created_at?: string
          ea_match_id?: string | null
          group_name?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          match_number?: number | null
          next_match_id?: string | null
          next_match_position?: string | null
          reported_by_discord_id?: string | null
          result_source?: string | null
          round_number?: number | null
          scheduled_at?: string | null
          stage?: string
          tournament_id?: string
          updated_at?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_standings: {
        Row: {
          draws: number
          goal_difference: number
          goals_against: number
          goals_for: number
          group_name: string
          id: string
          losses: number
          played: number
          points: number
          position: number | null
          qualified: boolean | null
          team_id: string
          tournament_id: string
          updated_at: string
          wins: number
        }
        Insert: {
          draws?: number
          goal_difference?: number
          goals_against?: number
          goals_for?: number
          group_name: string
          id?: string
          losses?: number
          played?: number
          points?: number
          position?: number | null
          qualified?: boolean | null
          team_id: string
          tournament_id: string
          updated_at?: string
          wins?: number
        }
        Update: {
          draws?: number
          goal_difference?: number
          goals_against?: number
          goals_for?: number
          group_name?: string
          id?: string
          losses?: number
          played?: number
          points?: number
          position?: number | null
          qualified?: boolean | null
          team_id?: string
          tournament_id?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_standings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          club_id: string
          created_at: string
          final_position: number | null
          group_name: string | null
          id: string
          invited_at: string
          invited_by_discord_id: string | null
          responded_at: string | null
          seed: number | null
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          final_position?: number | null
          group_name?: string | null
          id?: string
          invited_at?: string
          invited_by_discord_id?: string | null
          responded_at?: string | null
          seed?: number | null
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          final_position?: number | null
          group_name?: string | null
          id?: string
          invited_at?: string
          invited_by_discord_id?: string | null
          responded_at?: string | null
          seed?: number | null
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "global_league_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          created_by_discord_id: string
          description: string | null
          elo_range_max: number | null
          elo_range_min: number | null
          ends_at: string | null
          format: string
          group_matches_per_team: number
          guild_id: string
          id: string
          max_teams: number
          min_teams: number
          name: string
          platform: string | null
          prize_description: string | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          rules: string | null
          starts_at: string | null
          status: string
          teams_per_group: number
          time_slot: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_discord_id: string
          description?: string | null
          elo_range_max?: number | null
          elo_range_min?: number | null
          ends_at?: string | null
          format?: string
          group_matches_per_team?: number
          guild_id: string
          id?: string
          max_teams?: number
          min_teams?: number
          name: string
          platform?: string | null
          prize_description?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rules?: string | null
          starts_at?: string | null
          status?: string
          teams_per_group?: number
          time_slot?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_discord_id?: string
          description?: string | null
          elo_range_max?: number | null
          elo_range_min?: number | null
          ends_at?: string | null
          format?: string
          group_matches_per_team?: number
          guild_id?: string
          id?: string
          max_teams?: number
          min_teams?: number
          name?: string
          platform?: string | null
          prize_description?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rules?: string | null
          starts_at?: string | null
          status?: string
          teams_per_group?: number
          time_slot?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trial_invites: {
        Row: {
          created_at: string
          discord_user_id: string
          event_id: string
        }
        Insert: {
          created_at?: string
          discord_user_id: string
          event_id: string
        }
        Update: {
          created_at?: string
          discord_user_id?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "availability_events"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_reports: {
        Row: {
          created_at: string
          due_at: string
          event_id: string
          guild_id: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          due_at: string
          event_id: string
          guild_id: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          due_at?: string
          event_id?: string
          guild_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "availability_events"
            referencedColumns: ["id"]
          },
        ]
      }
      trialists: {
        Row: {
          club_key: string | null
          created_at: string
          decided_at: string | null
          decided_by_discord_id: string | null
          discord_user_id: string
          ea_username: string | null
          guild_id: string
          id: string
          notes: string | null
          platform: string | null
          positions: string[]
          status: string
          trial_count: number
          updated_at: string
        }
        Insert: {
          club_key?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_discord_id?: string | null
          discord_user_id: string
          ea_username?: string | null
          guild_id: string
          id?: string
          notes?: string | null
          platform?: string | null
          positions?: string[]
          status?: string
          trial_count?: number
          updated_at?: string
        }
        Update: {
          club_key?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_discord_id?: string | null
          discord_user_id?: string
          ea_username?: string | null
          guild_id?: string
          id?: string
          notes?: string | null
          platform?: string | null
          positions?: string[]
          status?: string
          trial_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      twitch_notifications: {
        Row: {
          created_at: string
          custom_message: string | null
          guild_id: string
          id: string
          is_live: boolean | null
          last_notified_at: string | null
          notification_channel_id: string
          subscription_id: string | null
          twitch_username: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_message?: string | null
          guild_id: string
          id?: string
          is_live?: boolean | null
          last_notified_at?: string | null
          notification_channel_id: string
          subscription_id?: string | null
          twitch_username: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_message?: string | null
          guild_id?: string
          id?: string
          is_live?: boolean | null
          last_notified_at?: string | null
          notification_channel_id?: string
          subscription_id?: string | null
          twitch_username?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_discord_links: {
        Row: {
          auth_user_id: string
          created_at: string
          discord_user_id: string
          id: string
          updated_at: string
          verification_code: string | null
          verified: boolean | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          discord_user_id: string
          id?: string
          updated_at?: string
          verification_code?: string | null
          verified?: boolean | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          discord_user_id?: string
          id?: string
          updated_at?: string
          verification_code?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          discord_user_id: string
          granted_at: string
          granted_by: string | null
          guild_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          discord_user_id: string
          granted_at?: string
          granted_by?: string | null
          guild_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          discord_user_id?: string
          granted_at?: string
          granted_by?: string | null
          guild_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      web_admins: {
        Row: {
          auth_user_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      xbox_detected_sessions: {
        Row: {
          created_at: string | null
          detected_at: string | null
          game_title: string | null
          guild_id: string
          id: string
          player_count: number
          players: Json
        }
        Insert: {
          created_at?: string | null
          detected_at?: string | null
          game_title?: string | null
          guild_id: string
          id?: string
          player_count: number
          players: Json
        }
        Update: {
          created_at?: string | null
          detected_at?: string | null
          game_title?: string | null
          guild_id?: string
          id?: string
          player_count?: number
          players?: Json
        }
        Relationships: []
      }
    }
    Views: {
      global_league_discord_standings: {
        Row: {
          avg_elo: number | null
          best_club_name: string | null
          best_elo: number | null
          club_count: number | null
          draws: number | null
          goals_against: number | null
          goals_for: number | null
          guild_id: string | null
          guild_name: string | null
          last_updated: string | null
          losses: number | null
          total_elo: number | null
          total_matches: number | null
          wins: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_old_club_matches: { Args: never; Returns: number }
      archive_old_global_league_matches: { Args: never; Returns: number }
      cleanup_old_event_occurrences: { Args: never; Returns: number }
      has_any_role: {
        Args: {
          _discord_user_id: string
          _guild_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _discord_user_id: string
          _guild_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      user_has_guild_access: {
        Args: { check_guild_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "captain"
        | "manager"
        | "scout"
        | "player"
      availability_response: "yes" | "no" | "maybe" | "no_response"
      competition_tier:
        | "major"
        | "minor"
        | "community"
        | "div1"
        | "div2"
        | "div3"
        | "div4"
      competition_type: "tournament" | "league"
      draft_status: "pending" | "picking" | "completed" | "cancelled"
      feedback_status: "pending" | "completed" | "expired"
      result_status: "pending" | "confirmed" | "disputed"
      verification_status: "pending" | "approved" | "rejected"
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
      app_role: ["admin", "moderator", "captain", "manager", "scout", "player"],
      availability_response: ["yes", "no", "maybe", "no_response"],
      competition_tier: [
        "major",
        "minor",
        "community",
        "div1",
        "div2",
        "div3",
        "div4",
      ],
      competition_type: ["tournament", "league"],
      draft_status: ["pending", "picking", "completed", "cancelled"],
      feedback_status: ["pending", "completed", "expired"],
      result_status: ["pending", "confirmed", "disputed"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const
