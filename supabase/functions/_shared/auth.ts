// Request authentication shared by edge functions that both the Discord bot and the web app call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type Caller =
  | { kind: "bot" }
  | { kind: "user"; userId: string };

// The bot sends the service-role key as its bearer token; the web app sends the signed-in user's JWT.
export async function identifyCaller(req: Request, admin: AdminClient): Promise<Caller | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRoleKey && token === serviceRoleKey) return { kind: "bot" };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { kind: "user", userId: data.user.id };
}

export function createAdminClient(): AdminClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}
