import { supabase } from "@/integrations/supabase/client";

// On gafferbot.app the Cloudflare Worker handles Discord OAuth at /api/auth/discord.
// Lovable-hosted previews have no Worker, so they keep using the cloud function.
const LOVABLE_HOSTED = typeof window !== "undefined" && /(^|\.)(lovable\.app|lovableproject\.com)$/.test(window.location.hostname);

export async function discordAuthApi<T = any>(body?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (LOVABLE_HOSTED) {
    const { data, error } = await supabase.functions.invoke("auth-discord", body ? { body } : { method: "GET" });
    return { data, error: error ? (data?.error ?? error.message) : null };
  }
  try {
    const res = await fetch("/api/auth/discord", body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "GET" });
    const data = await res.json().catch(() => null);
    return { data, error: res.ok ? null : (data?.error ?? `Request failed (${res.status})`) };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Network error" };
  }
}
