// Bring your own AI key for images (Jeff, 2026-11-15: "make it so users can add their own ai keys safely to make
// images on their own accounts and through the mcp"). A player can save their own OpenAI API key, and a club leader
// can save one for the whole server. Graphics Studio (Discord, the web Control Room and AI apps over MCP) then draws
// AI art on that key: the requester's own key first, then the server's, else GafferBot's own key, which is the only
// one that spends the server's image allowance and packs.
//
// Safety:
//  - Keys are checked with OpenAI before saving (listing models is free) and stored AES-GCM encrypted with a server
//    secret (AI_KEY_SECRET, else HELPER_KEY_SECRET, else the service role key). The scope, owner and provider are
//    the encryption's additional data, so a key copied onto another row or server won't decrypt.
//  - The table is service-role only. No route ever returns a saved key: only its last 4 characters.
//  - Keys are only sent to OpenAI, and only by the self-hosted bot (GAFFERBOT_SELF_HOSTED, set by local-functions),
//    never through a hosted AI gateway.
// deno-lint-ignore no-explicit-any
type Db = any;
type Env = (k: string) => string | undefined;

export type KeyScope = "user" | "server";
export type Provider = "openai";
export type ImageKey = { key: string; source: "yours" | "server" };

export const PROVIDERS: Provider[] = ["openai"];
/** OpenAI keys: sk-…, sk-proj-…, sk-svcacct-… (allow any sk- key so newer formats still save). */
const KEY_SHAPE = /^sk-[A-Za-z0-9_-]{20,300}$/;
const MODELS_URL = "https://api.openai.com/v1/models";
const snowflake = (id: string) => /^\d{17,20}$/.test(id);

export class KeyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const aad = (scope: KeyScope, owner: string, provider: Provider) => new TextEncoder().encode(`${scope}:${owner}:${provider}`);

async function sealKey(env: Env): Promise<CryptoKey | null> {
  const secret = env("AI_KEY_SECRET") || env("HELPER_KEY_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`gafferbot-provider-key:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptKey(env: Env, scope: KeyScope, owner: string, provider: Provider, key: string): Promise<string> {
  const k = await sealKey(env);
  if (!k) throw new KeyError("The server can't store keys safely yet (no secret set). Ask the GafferBot admin.", 503);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(scope, owner, provider) }, k, new TextEncoder().encode(key)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1:${b64(out)}`;
}

export async function decryptKey(env: Env, scope: KeyScope, owner: string, provider: Provider, sealed: string | null | undefined): Promise<string | null> {
  if (!sealed?.startsWith("v1:")) return null;
  const k = await sealKey(env);
  if (!k) return null;
  try {
    const raw = unb64(sealed.slice(3));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: aad(scope, owner, provider) }, k, raw.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null; // the server secret changed since the key was saved, or the row was tampered with
  }
}

export interface KeyStatus {
  saved: boolean;
  key_hint: string | null;
  updated_at: string | null;
  last_used_at: string | null;
  /** The last problem OpenAI reported with this key (refused, out of credit), cleared on the next good render. */
  last_error: string | null;
  /** A key is saved but the server can't unlock it any more: save it again. */
  unreadable: boolean;
}

const EMPTY: KeyStatus = { saved: false, key_hint: null, updated_at: null, last_used_at: null, last_error: null, unreadable: false };

async function row(db: Db, scope: KeyScope, owner: string, provider: Provider) {
  const { data, error } = await db.from("ai_provider_keys")
    .select("key_encrypted, key_hint, updated_at, last_used_at, last_error")
    .eq("scope", scope).eq("owner_id", owner).eq("provider", provider).maybeSingle();
  if (error) throw new KeyError(`Couldn't read saved keys: ${error.message}`, 500);
  return data as { key_encrypted: string; key_hint: string; updated_at: string; last_used_at: string | null; last_error: string | null } | null;
}

export async function keyStatus(db: Db, env: Env, scope: KeyScope, owner: string, provider: Provider = "openai"): Promise<KeyStatus> {
  const r = await row(db, scope, owner, provider);
  if (!r) return EMPTY;
  const key = await decryptKey(env, scope, owner, provider, r.key_encrypted);
  return { saved: !!key, key_hint: r.key_hint, updated_at: r.updated_at, last_used_at: r.last_used_at, last_error: r.last_error, unreadable: !key };
}

/** Ask OpenAI whether the key works (listing models is free). Throws a KeyError a person can act on. */
export async function checkOpenAiKey(key: string, fetchFn: typeof fetch = fetch): Promise<void> {
  let res: Response;
  try {
    res = await fetchFn(MODELS_URL, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new KeyError("Couldn't reach OpenAI to check the key. Try again in a minute.", 502);
  }
  await res.body?.cancel().catch(() => {});
  if (res.status === 401 || res.status === 403) throw new KeyError("OpenAI turned that key down. Check it's copied in full and still active.", 422);
  if (!res.ok && res.status !== 429 && res.status < 500) throw new KeyError(`OpenAI couldn't check that key (error ${res.status}).`, 422);
  // 429 / 5xx: OpenAI is busy, but the key wasn't refused, so it can be saved.
}

export function cleanKey(input: unknown): string {
  const key = typeof input === "string" ? input.trim() : "";
  if (!key) throw new KeyError("Paste your OpenAI API key.");
  if (!KEY_SHAPE.test(key)) throw new KeyError("That doesn't look like an OpenAI API key. It starts with sk- and comes from platform.openai.com → API keys.");
  return key;
}

/** Check, encrypt and save a key (replacing any earlier one for the same owner). */
export async function saveKey(
  db: Db, env: Env, scope: KeyScope, owner: string, input: unknown, addedBy: string, provider: Provider = "openai", fetchFn: typeof fetch = fetch,
): Promise<KeyStatus> {
  if (!snowflake(owner)) throw new KeyError("Unknown account or server.");
  const key = cleanKey(input);
  await checkOpenAiKey(key, fetchFn);
  const key_encrypted = await encryptKey(env, scope, owner, provider, key);
  const now = new Date().toISOString();
  const { error } = await db.from("ai_provider_keys").upsert({
    scope, owner_id: owner, provider, key_encrypted, key_hint: key.slice(-4), added_by: addedBy, updated_at: now, last_error: null,
  }, { onConflict: "scope,owner_id,provider" });
  if (error) throw new KeyError(`Couldn't save the key: ${error.message}`, 500);
  return keyStatus(db, env, scope, owner, provider);
}

export async function removeKey(db: Db, env: Env, scope: KeyScope, owner: string, provider: Provider = "openai"): Promise<KeyStatus> {
  const { error } = await db.from("ai_provider_keys").delete().eq("scope", scope).eq("owner_id", owner).eq("provider", provider);
  if (error) throw new KeyError(`Couldn't remove the key: ${error.message}`, 500);
  return EMPTY;
}

/** Own keys work only on the self-hosted bot, which sends them straight to OpenAI. AI_OWN_KEYS=off turns them off. */
export function ownKeysEnabled(env: Env) {
  return env("GAFFERBOT_SELF_HOSTED") === "1" && !/^(off|false|0|no)$/i.test(String(env("AI_OWN_KEYS") ?? "").trim());
}

/** The key an image for this member in this server is drawn on: theirs first, then the server's, else null (GafferBot pays). */
export async function imageKeyFor(db: Db, env: Env, who: { userId?: string | null; guildId?: string | null }): Promise<ImageKey | null> {
  if (!ownKeysEnabled(env)) return null;
  const tries: [KeyScope, string | null | undefined, ImageKey["source"]][] = [["user", who.userId, "yours"], ["server", who.guildId, "server"]];
  for (const [scope, owner, source] of tries) {
    if (!owner || !snowflake(owner)) continue;
    try {
      const r = await row(db, scope, owner, "openai");
      const key = r ? await decryptKey(env, scope, owner, "openai", r.key_encrypted) : null;
      if (key) return { key, source };
    } catch (err) {
      console.warn(`[ai-keys] ${scope} key lookup failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return null;
}

/** Note how a render on an own key went, so the owner sees a refused or empty key on their settings. */
export async function noteKeyUse(db: Db, who: { userId?: string | null; guildId?: string | null }, source: ImageKey["source"], error: string | null) {
  const scope: KeyScope = source === "yours" ? "user" : "server";
  const owner = source === "yours" ? who.userId : who.guildId;
  if (!owner) return;
  await db.from("ai_provider_keys").update({ last_used_at: new Date().toISOString(), last_error: error ? error.slice(0, 300) : null })
    .eq("scope", scope).eq("owner_id", owner).eq("provider", "openai")
    .then(() => {}, () => {});
}

/** A failed OpenAI call on someone's own key, in words that say whose key and what to do. */
export function ownKeyProblem(status: number, detail: string, source: ImageKey["source"]): string {
  const whose = source === "yours" ? "Your OpenAI key" : "This server's OpenAI key";
  const where = source === "yours" ? "on your GafferBot profile" : "on the server's Plans & AI Images page";
  if (status === 401) return `${whose} was refused by OpenAI. Replace or remove it ${where}.`;
  if (/verif/i.test(detail)) return `${whose} works, but OpenAI needs the account's organization verified before it can make images (platform.openai.com → Settings → Organization).`;
  if (status === 429 && /quota|billing|credit/i.test(detail)) return `${whose} is out of OpenAI credit. Top up at platform.openai.com → Billing, or remove the key ${where}.`;
  if (status === 429) return `${whose} hit OpenAI's rate limit. Try again in a minute.`;
  if (status === 403) return `${whose} isn't allowed to use OpenAI's image models. Check the key's permissions ${where}.`;
  return "";
}
