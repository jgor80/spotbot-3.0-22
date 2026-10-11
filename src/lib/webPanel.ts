// Client for the web-panel backend function: the web app's control room presses the same
// /manager and /me panel buttons as the Discord bot, as the signed-in user's Discord account.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface PanelField {
  name: string;
  label: string;
  description: string | null;
  type: number; // Discord option type: 3 text, 4 integer, 5 yes/no, 6 user, 7 channel, 8 role, 9 mentionable, 10 number
  required: boolean;
  choices: { name: string; value: string }[] | null;
  autocomplete: boolean;
  kind?: "when";
  channelTypes?: number[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface PanelAction {
  id: string;
  label: string;
  emoji: string;
  style: "primary" | "secondary" | "success" | "danger";
  fields: PanelField[];
  ask: boolean;
  denied: string | null;
  discordOnly: string | null;
  hint: string | null;
}

export interface PanelArea {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
  actions: PanelAction[];
}

export interface PanelChannel {
  id: string;
  name: string;
  type: number;
  parent: string | null;
  canSend: boolean;
}

export interface PanelContext {
  guild: { id: string; name: string; icon: string | null };
  user: { id: string; name: string };
  leader: boolean;
  timezone: string;
  voiceChannelId: string | null;
  defaultChannelId: string | null;
  channels: PanelChannel[];
  roles: { id: string; name: string; color: string | null }[];
  player: PanelArea;
  areas: PanelArea[];
}

// Discord message JSON as the bot built it (embeds and components in API shape)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiObject = Record<string, any>;

export interface BotPayload {
  content: string | null;
  embeds: ApiObject[];
  components: ApiObject[];
  files: { name: string; url: string | null; tooLarge?: boolean }[];
}

export interface BotMessage {
  id: string;
  ephemeral: boolean;
  channelId: string | null;
  discordMessageId: string | null;
  thinking: boolean;
  deleted: boolean;
  payload: BotPayload;
}

export interface MentionNames {
  users: Record<string, string>;
  channels: Record<string, string>;
  roles: Record<string, { name: string; color: string | null }>;
}

export interface RunResult {
  runId: string;
  done: boolean;
  error: string | null;
  modal: { json: ApiObject } | null;
  messages: BotMessage[];
  names: MentionNames;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("web-panel", { body });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => null);
      if (detail?.error) message = detail.error;
    }
    throw new Error(message);
  }
  return data as T;
}

export const webPanel = {
  context: (guildId: string) => call<PanelContext>({ op: "context", guild_id: guildId }),
  members: (guildId: string, query: string) =>
    call<{ members: { id: string; name: string; username: string; avatar: string }[] }>({ op: "members", guild_id: guildId, query }),
  choices: (guildId: string, actionId: string, field: string, focused: string, channelId: string | null) =>
    call<{ choices: { name: string; value: string }[] }>({ op: "choices", guild_id: guildId, action_id: actionId, field, focused, channel_id: channelId }),
  run: (guildId: string, actionId: string, values: Record<string, unknown>, channelId: string | null) =>
    call<RunResult>({ op: "run", guild_id: guildId, action_id: actionId, values, channel_id: channelId }),
  click: (guildId: string, messageId: string, customId: string, values?: string[]) =>
    call<RunResult>({ op: "click", guild_id: guildId, message_id: messageId, custom_id: customId, values }),
  submit: (guildId: string, runId: string, values: Record<string, unknown>) =>
    call<RunResult>({ op: "submit", guild_id: guildId, run_id: runId, values }),
  poll: (guildId: string, runId: string) => call<RunResult>({ op: "poll", guild_id: guildId, run_id: runId }),
};
