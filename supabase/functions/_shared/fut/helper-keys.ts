// Helper keys (Jeff, 2026-11-02): the XI Lab browser helper uploads what it captured (prices, club) straight to
// the user's XI Lab account instead of the user downloading a file and importing it. A key can ONLY call the
// upload routes; it can't read squads, cards or prices. One active key per user; making a new one turns the old one
// off. Only a SHA-256 hash is stored, so the key is shown once.
import { hashToken, randomString } from "../mcp-tokens.ts";
import { FutDbError, type FutDb } from "./service.ts";

export const HELPER_KEY_PREFIX = "xlh_";
/** The only routes a helper key may call. */
export const HELPER_ROUTES = new Set(["/helper/prices", "/helper/club", "/helper/packs", "/helper/account", "/helper/images"]);

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
export async function createHelperKey(db: FutDb, userId: string) {
  await revokeHelperKeys(db, userId);
  const key = HELPER_KEY_PREFIX + randomString(24);
  fail((await db.from("helper_keys").insert({ user_id: userId, key_hash: await hashToken(key), key_hint: key.slice(-4) })).error);
  return { key, ...(await helperStatus(db, userId)) };
}
