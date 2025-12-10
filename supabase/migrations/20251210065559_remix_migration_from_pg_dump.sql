CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: blocked_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guild_id text NOT NULL,
    user_id text NOT NULL,
    blocked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: guild_queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_queues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guild_id text NOT NULL,
    club_key text NOT NULL,
    slot_index integer NOT NULL,
    user_ids text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: guild_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guild_id text NOT NULL,
    clubs jsonb DEFAULT '[{"key": "club1", "name": "Club 1", "enabled": true}, {"key": "club2", "name": "Club 2", "enabled": false}, {"key": "club3", "name": "Club 3", "enabled": false}, {"key": "club4", "name": "Club 4", "enabled": false}, {"key": "club5", "name": "Club 5", "enabled": false}]'::jsonb NOT NULL,
    board_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    club_vc_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    current_club_key text DEFAULT 'club1'::text NOT NULL,
    admin_panel_channel_id text,
    admin_panel_message_id text,
    vc_panels jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: position_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.position_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guild_id text NOT NULL,
    user_id text NOT NULL,
    preferences text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_users blocked_users_guild_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_guild_id_user_id_key UNIQUE (guild_id, user_id);


--
-- Name: blocked_users blocked_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_pkey PRIMARY KEY (id);


--
-- Name: guild_queues guild_queues_guild_id_club_key_slot_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_queues
    ADD CONSTRAINT guild_queues_guild_id_club_key_slot_index_key UNIQUE (guild_id, club_key, slot_index);


--
-- Name: guild_queues guild_queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_queues
    ADD CONSTRAINT guild_queues_pkey PRIMARY KEY (id);


--
-- Name: guild_settings guild_settings_guild_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_settings
    ADD CONSTRAINT guild_settings_guild_id_key UNIQUE (guild_id);


--
-- Name: guild_settings guild_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_settings
    ADD CONSTRAINT guild_settings_pkey PRIMARY KEY (id);


--
-- Name: position_preferences position_preferences_guild_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_preferences
    ADD CONSTRAINT position_preferences_guild_id_user_id_key UNIQUE (guild_id, user_id);


--
-- Name: position_preferences position_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_preferences
    ADD CONSTRAINT position_preferences_pkey PRIMARY KEY (id);


--
-- Name: idx_blocked_users_guild_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocked_users_guild_id ON public.blocked_users USING btree (guild_id);


--
-- Name: idx_guild_queues_guild_club; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guild_queues_guild_club ON public.guild_queues USING btree (guild_id, club_key);


--
-- Name: idx_guild_settings_guild_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guild_settings_guild_id ON public.guild_settings USING btree (guild_id);


--
-- Name: idx_position_preferences_guild_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_position_preferences_guild_user ON public.position_preferences USING btree (guild_id, user_id);


--
-- Name: guild_queues update_guild_queues_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_guild_queues_updated_at BEFORE UPDATE ON public.guild_queues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: guild_settings update_guild_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_guild_settings_updated_at BEFORE UPDATE ON public.guild_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: position_preferences update_position_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_position_preferences_updated_at BEFORE UPDATE ON public.position_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: blocked_users Allow public delete on blocked_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete on blocked_users" ON public.blocked_users FOR DELETE USING (true);


--
-- Name: guild_queues Allow public delete on guild_queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete on guild_queues" ON public.guild_queues FOR DELETE USING (true);


--
-- Name: guild_settings Allow public delete on guild_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete on guild_settings" ON public.guild_settings FOR DELETE USING (true);


--
-- Name: position_preferences Allow public delete on position_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete on position_preferences" ON public.position_preferences FOR DELETE USING (true);


--
-- Name: blocked_users Allow public insert on blocked_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert on blocked_users" ON public.blocked_users FOR INSERT WITH CHECK (true);


--
-- Name: guild_queues Allow public insert on guild_queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert on guild_queues" ON public.guild_queues FOR INSERT WITH CHECK (true);


--
-- Name: guild_settings Allow public insert on guild_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert on guild_settings" ON public.guild_settings FOR INSERT WITH CHECK (true);


--
-- Name: position_preferences Allow public insert on position_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert on position_preferences" ON public.position_preferences FOR INSERT WITH CHECK (true);


--
-- Name: blocked_users Allow public select on blocked_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select on blocked_users" ON public.blocked_users FOR SELECT USING (true);


--
-- Name: guild_queues Allow public select on guild_queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select on guild_queues" ON public.guild_queues FOR SELECT USING (true);


--
-- Name: guild_settings Allow public select on guild_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select on guild_settings" ON public.guild_settings FOR SELECT USING (true);


--
-- Name: position_preferences Allow public select on position_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select on position_preferences" ON public.position_preferences FOR SELECT USING (true);


--
-- Name: blocked_users Allow public update on blocked_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update on blocked_users" ON public.blocked_users FOR UPDATE USING (true);


--
-- Name: guild_queues Allow public update on guild_queues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update on guild_queues" ON public.guild_queues FOR UPDATE USING (true);


--
-- Name: guild_settings Allow public update on guild_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update on guild_settings" ON public.guild_settings FOR UPDATE USING (true);


--
-- Name: position_preferences Allow public update on position_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update on position_preferences" ON public.position_preferences FOR UPDATE USING (true);


--
-- Name: blocked_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

--
-- Name: guild_queues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guild_queues ENABLE ROW LEVEL SECURITY;

--
-- Name: guild_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guild_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: position_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.position_preferences ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


