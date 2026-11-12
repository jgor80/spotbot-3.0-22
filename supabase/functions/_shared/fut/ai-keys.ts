// Your own Claude API key (Jeff, 2026-11-11: "give me a place to add a claude api key"). A signed-in user can save
// an Anthropic API key on their profile. XI Lab's AI features (squad reader, player finder, Knowledge Bank Ask and
// reading the sources you add) then call Claude with that key instead of the server's ANTHROPIC_API_KEY, and the
// hourly AI caps don't apply because the calls are on the user's own bill. Background jobs keep the server key.
//
// The key is stored AES-GCM encrypted with a server secret (AI_KEY_SECRET, else HELPER_KEY_SECRET, else the service
// role key) and tied to the user, so a database copy alone can't reveal it. Only its owner can see it again.
import { FutDbError, FutError, type FutDb } from "./service.ts";

type Env = (k: string) => string | undefined;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Anthropic keys look like sk-ant-api03-…; allow any sk-ant- key so newer formats still save. */
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,250}$/;
const MODELS_URL = "https://api.anthropic.com/v1/models?limit=1";

async function sealKey(env: Env): Promise<CryptoKey | null> {
  const secret = env("AI_KEY_SECRET") || env("HELPER_KEY_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`gafferbot-ai-key:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(env: Env, userId: string, key: string): Promise<string> {
  const k = await sealKey(env);
  if (!k) throw new FutError("The server can't store keys safely yet (no secret set). Ask the GafferBot admin.", 503);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, k, new TextEncoder().encode(key)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1:${b64(out)}`;
}

async function decrypt(env: Env, userId: string, sealed: string | null | undefined): Promise<string | null> {
  if (!sealed?.startsWith("v1:")) return null;
  const k = await sealKey(env);
  if (!k) return null;
  try {
    const raw = unb64(sealed.slice(3));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(userId) }, k, raw.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null; // the server secret changed since the key was saved
  }
}

const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};

export interface AiKeyStatus {
  /** You saved a key and the server can read it. */
  saved: boolean;
  key_hint: string | null;
  updated_at: string | null;
  /** Which key the AI features use for you right now. */
  using: "yours" | "server" | "none";
  /** A key is saved but the server can't unlock it any more (its secret changed): save it again. */
  unreadable: boolean;
}

async function row(db: FutDb, userId: string) {
  const { data, error } = await db.from("user_ai_keys").select("key_encrypted, key_hint, updated_at").eq("user_id", userId).maybeSingle();
  fail(error);
  return data as { key_encrypted: string; key_hint: string; updated_at: string } | null;
}

/** The user's own key in plain text, or null. Only for calling Claude on their behalf and for their profile. */
export async function userAiKey(db: FutDb, userId: string, env: Env): Promise<string | null> {
  const r = await row(db, userId);
  return r ? await decrypt(env, userId, r.key_encrypted) : null;
}

export async function aiKeyStatus(db: FutDb, userId: string, env: Env): Promise<AiKeyStatus> {
  const r = await row(db, userId);
  const key = r ? await decrypt(env, userId, r.key_encrypted) : null;
  const server = !!(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY"));
  return {
    saved: !!key, key_hint: r?.key_hint ?? null, updated_at: r?.updated_at ?? null,
    using: key ? "yours" : server ? "server" : "none", unreadable: !!r && !key,
  };
}

/** The full key again, for its owner's profile. */
export async function revealAiKey(db: FutDb, userId: string, env: Env) {
  return { key: await userAiKey(db, userId, env) };
}

/** Check the key with Anthropic (listing models is free), then save it encrypted. Replaces any earlier key. */
export async function saveAiKey(db: FutDb, userId: string, input: unknown, env: Env, fetchFn: typeof fetch = fetch): Promise<AiKeyStatus> {
  const key = typeof input === "string" ? input.trim() : "";
  if (!key) throw new FutError("Paste your Claude API key.");
  if (!KEY_SHAPE.test(key)) throw new FutError("That doesn't look like a Claude API key. It starts with sk-ant- and comes from console.anthropic.com → API keys.");
  let res: Response;
  try {
    res = await fetchFn(MODELS_URL, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new FutError("Couldn't reach Anthropic to check the key. Try again in a minute.", 502);
  }
  await res.body?.cancel().catch(() => {});
  if (res.status === 401 || res.status === 403) throw new FutError("Anthropic turned that key down. Check it's copied in full and still active.", 422);
  if (!res.ok && res.status !== 429 && res.status < 500) throw new FutError(`Anthropic couldn't check that key (error ${res.status}).`, 422);
  // 429 / 5xx: Anthropic is busy, but the key wasn't refused, so save it.
  const key_encrypted = await encrypt(env, userId, key);
  const now = new Date().toISOString();
  fail((await db.from("user_ai_keys").upsert({ user_id: userId, key_encrypted, key_hint: key.slice(-4), updated_at: now }, { onConflict: "user_id" })).error);
  return aiKeyStatus(db, userId, env);
}

export async function removeAiKey(db: FutDb, userId: string, env: Env): Promise<AiKeyStatus> {
  fail((await db.from("user_ai_keys").delete().eq("user_id", userId)).error);
  return aiKeyStatus(db, userId, env);
}

/** env for one user's AI calls: their own key in place of the server's when they saved one. */
export async function envForUser(db: FutDb, userId: string, env: Env): Promise<{ env: Env; own: boolean }> {
  let key: string | null = null;
  try { key = await userAiKey(db, userId, env); } catch (e) { console.error("[fut-api] user AI key:", e); }
  if (!key) return { env, own: false };
  return { env: (k: string) => (k === "ANTHROPIC_API_KEY" || k === "CLAUDE_API_KEY" ? key! : env(k)), own: true };
}
