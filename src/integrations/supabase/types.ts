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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
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
          channel_id: string | null
          closed: boolean
          created_at: string
          created_by_discord_id: string
          description: string | null
          duration_minutes: number | null
          event_type: string
          guild_id: string
          id: string
          message_id: string | null
          reminder_24h_sent: boolean
          reminder_2h_sent: boolean
          scheduled_at: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          closed?: boolean
          created_at?: string
          created_by_discord_id: string
          description?: string | null
          duration_minutes?: number | null
          event_type?: string
          guild_id: string
          id?: string
          message_id?: string | null
          reminder_24h_sent?: boolean
          reminder_2h_sent?: boolean
          scheduled_at: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          closed?: boolean
          created_at?: string
          created_by_discord_id?: string
          description?: string | null
          duration_minutes?: number | null
          event_type?: string
          guild_id?: string
          id?: string
          message_id?: string | null
          reminder_24h_sent?: boolean
          reminder_2h_sent?: boolean
          scheduled_at?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
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
          result: string | null
          score_against: number | null
          score_for: number | null
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
          result?: string | null
          score_against?: number | null
          score_for?: number | null
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
          result?: string | null
          score_against?: number | null
          score_for?: number | null
        }
        Relationships: []
      }
      club_stats: {
        Row: {
          best_division: string | null
          club_key: string
          club_name: string | null
          created_at: string
          draws: number | null
          ea_club_id: string
          ea_platform: string
          goals_conceded: number | null
          goals_scored: number | null
          guild_id: string
          id: string
          last_synced_at: string | null
          losses: number | null
          skill_rating: number | null
          total_members: number | null
          updated_at: string
          wins: number | null
        }
        Insert: {
          best_division?: string | null
          club_key: string
          club_name?: string | null
          created_at?: string
          draws?: number | null
          ea_club_id: string
          ea_platform: string
          goals_conceded?: number | null
          goals_scored?: number | null
          guild_id: string
          id?: string
          last_synced_at?: string | null
          losses?: number | null
          skill_rating?: number | null
          total_members?: number | null
          updated_at?: string
          wins?: number | null
        }
        Update: {
          best_division?: string | null
          club_key?: string
          club_name?: string | null
          created_at?: string
          draws?: number | null
          ea_club_id?: string
          ea_platform?: string
          goals_conceded?: number | null
          goals_scored?: number | null
          guild_id?: string
          id?: string
          last_synced_at?: string | null
          losses?: number | null
          skill_rating?: number | null
          total_members?: number | null
          updated_at?: string
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
          status: Database["public"]["Enums"]["feedback_status"]
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
          status?: Database["public"]["Enums"]["feedback_status"]
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
          status?: Database["public"]["Enums"]["feedback_status"]
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
          captain_a_discord_id: string
          captain_b_discord_id: string
          completed_at: string | null
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
          captain_a_discord_id: string
          captain_b_discord_id: string
          completed_at?: string | null
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
          captain_a_discord_id?: string
          captain_b_discord_id?: string
          completed_at?: string | null
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
          club_vc_links: Json
          clubs: Json
          created_at: string
          current_club_key: string
          guild_id: string
          id: string
          updated_at: string
          vc_panels: Json
        }
        Insert: {
          admin_panel_channel_id?: string | null
          admin_panel_message_id?: string | null
          board_state?: Json
          club_vc_links?: Json
          clubs?: Json
          created_at?: string
          current_club_key?: string
          guild_id: string
          id?: string
          updated_at?: string
          vc_panels?: Json
        }
        Update: {
          admin_panel_channel_id?: string | null
          admin_panel_message_id?: string | null
          board_state?: Json
          club_vc_links?: Json
          clubs?: Json
          created_at?: string
          current_club_key?: string
          guild_id?: string
          id?: string
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
          win_probability: number | null
        }
        Insert: {
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
          win_probability?: number | null
        }
        Update: {
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
          clutch_factor: number | null
          communication: number | null
          consistency: number | null
          created_at: string
          draft_id: string | null
          evaluated_discord_id: string
          evaluator_discord_id: string
          game_iq: number | null
          guild_id: string
          id: string
          overall_score: number | null
          technical_skill: number | null
          trust_weighted_score: number | null
          work_ethic: number | null
        }
        Insert: {
          clutch_factor?: number | null
          communication?: number | null
          consistency?: number | null
          created_at?: string
          draft_id?: string | null
          evaluated_discord_id: string
          evaluator_discord_id: string
          game_iq?: number | null
          guild_id: string
          id?: string
          overall_score?: number | null
          technical_skill?: number | null
          trust_weighted_score?: number | null
          work_ethic?: number | null
        }
        Update: {
          clutch_factor?: number | null
          communication?: number | null
          consistency?: number | null
          created_at?: string
          draft_id?: string | null
          evaluated_discord_id?: string
          evaluator_discord_id?: string
          game_iq?: number | null
          guild_id?: string
          id?: string
          overall_score?: number | null
          technical_skill?: number | null
          trust_weighted_score?: number | null
          work_ethic?: number | null
        }
        Relationships: [
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
          responded_at: string | null
          response: Database["public"]["Enums"]["availability_response"]
        }
        Insert: {
          auto_marked?: boolean
          discord_user_id: string
          event_id: string
          id?: string
          responded_at?: string | null
          response?: Database["public"]["Enums"]["availability_response"]
        }
        Update: {
          auto_marked?: boolean
          discord_user_id?: string
          event_id?: string
          id?: string
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
          build_quality_rating: number | null
          club_performance_rating: number | null
          created_at: string
          discord_user_id: string
          draft_performance_rating: number | null
          draws: number
          games_played: number
          guild_id: string
          id: string
          last_calculated_at: string
          last_game_at: string | null
          losses: number
          overall_rating: number
          peer_rating: number | null
          total_assists: number
          total_clean_sheets: number
          total_goals: number
          total_motm: number
          updated_at: string
          wins: number
        }
        Insert: {
          build_quality_rating?: number | null
          club_performance_rating?: number | null
          created_at?: string
          discord_user_id: string
          draft_performance_rating?: number | null
          draws?: number
          games_played?: number
          guild_id: string
          id?: string
          last_calculated_at?: string
          last_game_at?: string | null
          losses?: number
          overall_rating?: number
          peer_rating?: number | null
          total_assists?: number
          total_clean_sheets?: number
          total_goals?: number
          total_motm?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          build_quality_rating?: number | null
          club_performance_rating?: number | null
          created_at?: string
          discord_user_id?: string
          draft_performance_rating?: number | null
          draws?: number
          games_played?: number
          guild_id?: string
          id?: string
          last_calculated_at?: string
          last_game_at?: string | null
          losses?: number
          overall_rating?: number
          peer_rating?: number | null
          total_assists?: number
          total_clean_sheets?: number
          total_goals?: number
          total_motm?: number
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
      player_stats: {
        Row: {
          assists: number
          clean_sheet: boolean | null
          created_at: string
          discord_user_id: string
          draft_id: string | null
          ea_match_id: string | null
          ea_match_rating: number | null
          goals: number
          guild_id: string
          id: string
          man_of_match: boolean | null
          match_type: string
          pass_attempts: number | null
          passes_made: number | null
          position_played: string | null
          recorded_at: string
          red_cards: boolean | null
          shots: number | null
          tackles: number | null
          team: string | null
          won: boolean | null
        }
        Insert: {
          assists?: number
          clean_sheet?: boolean | null
          created_at?: string
          discord_user_id: string
          draft_id?: string | null
          ea_match_id?: string | null
          ea_match_rating?: number | null
          goals?: number
          guild_id: string
          id?: string
          man_of_match?: boolean | null
          match_type?: string
          pass_attempts?: number | null
          passes_made?: number | null
          position_played?: string | null
          recorded_at?: string
          red_cards?: boolean | null
          shots?: number | null
          tackles?: number | null
          team?: string | null
          won?: boolean | null
        }
        Update: {
          assists?: number
          clean_sheet?: boolean | null
          created_at?: string
          discord_user_id?: string
          draft_id?: string | null
          ea_match_id?: string | null
          ea_match_rating?: number | null
          goals?: number
          guild_id?: string
          id?: string
          man_of_match?: boolean | null
          match_type?: string
          pass_attempts?: number | null
          passes_made?: number | null
          position_played?: string | null
          recorded_at?: string
          red_cards?: boolean | null
          shots?: number | null
          tackles?: number | null
          team?: string | null
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
          assists: number
          current_streak: number
          discord_user_id: string
          discord_username: string | null
          form_rating: number | null
          games_played: number
          goals: number
          guild_id: string
          id: string
          last_active_at: string | null
          league_wins: number
          longest_win_streak: number
          major_wins: number
          overall_rating: number
          primary_position: string | null
          reliability_score: number | null
          streak_type: string | null
          top_achievements: string[]
          tournament_wins: number
          updated_at: string
          win_rate: number
          wins: number
        }
        Insert: {
          achievement_count?: number
          assists?: number
          current_streak?: number
          discord_user_id: string
          discord_username?: string | null
          form_rating?: number | null
          games_played?: number
          goals?: number
          guild_id: string
          id?: string
          last_active_at?: string | null
          league_wins?: number
          longest_win_streak?: number
          major_wins?: number
          overall_rating?: number
          primary_position?: string | null
          reliability_score?: number | null
          streak_type?: string | null
          top_achievements?: string[]
          tournament_wins?: number
          updated_at?: string
          win_rate?: number
          wins?: number
        }
        Update: {
          achievement_count?: number
          assists?: number
          current_streak?: number
          discord_user_id?: string
          discord_username?: string | null
          form_rating?: number | null
          games_played?: number
          goals?: number
          guild_id?: string
          id?: string
          last_active_at?: string | null
          league_wins?: number
          longest_win_streak?: number
          major_wins?: number
          overall_rating?: number
          primary_position?: string | null
          reliability_score?: number | null
          streak_type?: string | null
          top_achievements?: string[]
          tournament_wins?: number
          updated_at?: string
          win_rate?: number
          wins?: number
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
          created_at: string
          discord_avatar: string | null
          discord_user_id: string
          discord_username: string | null
          ea_persona_id: string | null
          ea_platform: string | null
          ea_username: string | null
          id: string
          primary_position: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discord_avatar?: string | null
          discord_user_id: string
          discord_username?: string | null
          ea_persona_id?: string | null
          ea_platform?: string | null
          ea_username?: string | null
          id?: string
          primary_position?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discord_avatar?: string | null
          discord_user_id?: string
          discord_username?: string | null
          ea_persona_id?: string | null
          ea_platform?: string | null
          ea_username?: string | null
          id?: string
          primary_position?: string | null
          updated_at?: string
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
      team_rosters: {
        Row: {
          discord_user_id: string
          id: string
          joined_at: string
          primary_position: string | null
          role: string
          team_id: string
        }
        Insert: {
          discord_user_id: string
          id?: string
          joined_at?: string
          primary_position?: string | null
          role?: string
          team_id: string
        }
        Update: {
          discord_user_id?: string
          id?: string
          joined_at?: string
          primary_position?: string | null
          role?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
