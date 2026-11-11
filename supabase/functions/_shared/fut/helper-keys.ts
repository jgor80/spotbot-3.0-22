// Helper keys (Jeff, 2026-11-02): the XI Lab browser helper uploads what it captured (prices, club) straight to
// the user's XI Lab account instead of the user downloading a file and importing it. A key can ONLY call the
// upload routes; it can't read squads, cards or prices. One active key per user; making a new one turns the old one
// off. The SHA-256 hash is what signs the helper in. Since 2026-11-11 (Jeff: "show the key in my profile") the key
// is also kept encrypted (AES-GCM, server secret HELPER_KEY_SECRET or else the service role key, tied to the user)
// so its owner can see it again on their profile. A database copy alone can't reveal keys without that secret.
import { hashToken, randomString } from "../mcp-tokens.ts";
import { FutDbError, type FutDb } from "./service.ts";

export const HELPER_KEY_PREFIX = "xlh_";
/** The only routes a helper key may call. */
export const HELPER_ROUTES = new Set(["/helper/prices", "/helper/club", "/helper/packs", "/helper/account", "/helper/images"]);

type Env = (k: string) => string | undefined;
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** AES-GCM key from the server secret, or null when the server has none (the key is then shown once only). */
async function sealKey(env: Env): Promise<CryptoKey | null> {
  const secret = env("HELPER_KEY_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`gafferbot-helper-key:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptHelperKey(env: Env, userId: string, key: string): Promise<string | null> {
  const k = await sealKey(env);
  if (!k) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, k, new TextEncoder().encode(key)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1:${b64(out)}`;
}

export async function decryptHelperKey(env: Env, userId: string, sealed: string | null | undefined): Promise<string | null> {
  if (!sealed?.startsWith("v1:")) return null;
  const k = await sealKey(env);
  if (!k) return null;
  try {
    const raw = unb64(sealed.slice(3));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(userId) }, k, raw.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null; // the server secret changed since the key was made
  }
}

const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};

export const looksLikeHelperKey = (s: string) => s.startsWith(HELPER_KEY_PREFIX) && s.length >= 30 && s.length <= 80;

/** The user a helper key belongs to, or null if it's unknown or turned off. Marks it used. */
export async function helperKeyUser(db: FutDb, key: string): Promise<string | null> {
  if (!looksLikeHelperKey(key)) return null;
  const { data, error } = await db.from("helper_keys").select("id, user_id").eq("key_hash", await hashToken(key)).is("revoked_at", null).maybeSingle();
  fail(error);
  if (!data) return null;
  fail((await db.from("helper_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)).error);
  return String(data.user_id);
}

export async function helperStatus(db: FutDb, userId: string) {
  const { data, error } = await db.from("helper_keys").select("key_hint, created_at, last_used_at").eq("user_id", userId).is("revoked_at", null).maybeSingle();
  fail(error);
  return data
    ? { connected: true, key_hint: String(data.key_hint), created_at: String(data.created_at), last_used_at: data.last_used_at ? String(data.last_used_at) : null }
    : { connected: false, key_hint: null, created_at: null, last_used_at: null };
}

/** Turn off this user's helper key(s). */
export async function revokeHelperKeys(db: FutDb, userId: string) {
  fail((await db.from("helper_keys").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null)).error);
  return helperStatus(db, userId);
}

/** A new key for this user (the old one stops working). The plain key is returned only here. */
export async function createHelperKey(db: FutDb, userId: string, env: Env = () => undefined) {
  await revokeHelperKeys(db, userId);
  const key = HELPER_KEY_PREFIX + randomString(24);
  const key_encrypted = await encryptHelperKey(env, userId, key);
  fail((await db.from("helper_keys").insert({ user_id: userId, key_hash: await hashToken(key), key_hint: key.slice(-4), key_encrypted })).error);
  return { key, ...(await helperStatus(db, userId)) };
}

/** The signed-in user's active key in full, for their profile. key is null for a key made before keys were kept. */
export async function revealHelperKey(db: FutDb, userId: string, env: Env) {
  const { data, error } = await db.from("helper_keys").select("key_encrypted").eq("user_id", userId).is("revoked_at", null).maybeSingle();
  fail(error);
  if (!data) return { connected: false, key: null };
  return { connected: true, key: await decryptHelperKey(env, userId, data.key_encrypted as string | null) };
}
