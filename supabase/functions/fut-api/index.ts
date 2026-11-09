// XI Lab website API. Routes and rules are in handler.ts; the services are shared with the MCP FUT tools.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, identifyCaller } from "../_shared/auth.ts";
import { futDb } from "../_shared/fut/service.ts";
import { handle } from "./handler.ts";
import { enableMarketCache } from "../_shared/fut/market.ts";

// One service-role client for the life of the process, so Market Lab can keep shared price data in memory
// between requests (see enableMarketCache). The client holds no per-user state.
const sharedAdmin = createAdminClient();
const db = futDb(sharedAdmin);
enableMarketCache(db);

// 120 calls a minute per user is far above what the squad builder needs; it only stops runaway loops.
const WINDOW_MS = 60_000;
const MAX_CALLS = 120;
const hits = new Map<string, number[]>();
function throttle(userId: string): Response | null {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) {
    return new Response(JSON.stringify({ error: "Too many requests. Wait a minute and try again." }), {
      status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60", "Access-Control-Allow-Origin": "*" },
    });
  }
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) hits.clear();
  return null;
}

serve((req) => {
  const admin = createAdminClient();
  return handle(req, {
    db,
    // Only a signed-in web user's session counts: the bot and the anon key get 401.
    userFor: async (r) => {
      const caller = await identifyCaller(r, admin);
      return caller?.kind === "user" ? caller.userId : null;
    },
    isBot: async (r) => (await identifyCaller(r, admin))?.kind === "bot",
    throttle,
  });
});
