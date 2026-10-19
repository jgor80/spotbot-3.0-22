#!/usr/bin/env node
// Deletes a player's or a server's data on request (privacy policy: within 30 days of an email request).
// Database rows go through the purge_data() SQL function, which finds every table with a Discord id or
// server id column; this script also removes their files from the pro-photos bucket (photos, card art,
// generated art, club crests). Without --confirm it only prints what would go.
//
// Usage (on the Hetzner box, Node 18+, no npm install needed; values from the bot's .env):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/hetzner/purge-data.mjs --user <discord id> [--confirm]
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/hetzner/purge-data.mjs --guild <server id> [--confirm]
//
// A server purge leaves billing records (kept for accounting); a player purge keeps them with the
// player's id blanked. Rows where the player only appears in a required "who did it" column are listed
// as "keep" so they can be reviewed by hand.

const BUCKET = "pro-photos";
const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const user = valueOf("--user");
const guild = valueOf("--guild");
const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ID = /^\d{5,25}$/;

if (!base || !key || (user ? 1 : 0) + (guild ? 1 : 0) !== 1 || !ID.test(user || guild)) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node purge-data.mjs (--user <discord id> | --guild <server id>) [--confirm]");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function api(method, url, body) {
  const res = await fetch(`${base}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status} ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

// Rows of one table, or [] when the table doesn't exist on this database
async function rows(table, select, filter) {
  try { return await api("GET", `/rest/v1/${table}?select=${select}&${filter}`); } catch { return []; }
}

// Every file under a folder of the bucket (storage lists one level at a time)
async function listFolder(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await api("POST", `/storage/v1/object/list/${BUCKET}`, { prefix, limit: 1000, offset }).catch(() => []);
    for (const entry of page || []) {
      const p = `${prefix}/${entry.name}`;
      if (entry.id === null) out.push(...(await listFolder(p)));
      else out.push(p);
    }
    if (!page || page.length < 1000) break;
  }
  return out;
}

async function filesFor() {
  const files = new Set();
  const add = (p) => { if (p && !/^https?:/.test(p)) files.add(p); };
  if (user) {
    const eq = `discord_user_id=eq.${user}`;
    for (const r of await rows("pro_photo_assets", "storage_path,guild_id", eq)) add(r.storage_path);
    for (const r of await rows("player_cards", "storage_path,back_path", eq)) { add(r.storage_path); add(r.back_path); }
    for (const p of await listFolder(`generated/${user}`)) add(p);
    for (const p of await listFolder(`cards/${user}`)) add(p);
    // Pro photos sit in <server>/<player>-<key>; look in every server the player has photos in
    const guilds = new Set([...(await rows("pro_photo_assets", "guild_id", eq)), ...(await rows("pro_photos", "guild_id", eq))].map((r) => r.guild_id).filter(Boolean));
    for (const g of guilds) for (const p of await listFolder(g)) if (p.startsWith(`${g}/${user}-`)) add(p);
  } else {
    const eq = `guild_id=eq.${guild}`;
    for (const r of await rows("pro_photo_assets", "storage_path", eq)) add(r.storage_path);
    for (const r of await rows("player_cards", "storage_path,back_path", eq)) { add(r.storage_path); add(r.back_path); }
    for (const p of await listFolder(guild)) add(p);
    for (const p of await listFolder(`club-crests/${guild}`)) add(p);
  }
  return [...files];
}

const kind = user ? "user" : "guild";
const id = user || guild;
console.log(`${confirm ? "Purging" : "Dry run for"} ${kind} ${id} on ${base}\n`);

const files = await filesFor();
const plan = await api("POST", "/rest/v1/rpc/purge_data", { p_kind: kind, p_id: id, p_dry_run: true });
for (const r of plan) console.log(`  ${r.table_name}.${r.column_name}: ${r.action} ${r.row_count ?? ""}`);
console.log(`  storage: ${confirm ? "" : "would "}delete ${files.length} file(s)`);

if (!confirm) {
  console.log("\nNothing changed. Run again with --confirm to delete.");
  process.exit(0);
}

// Files first: once the rows are gone, nothing points at them any more
for (let i = 0; i < files.length; i += 500) {
  await api("DELETE", `/storage/v1/object/${BUCKET}`, { prefixes: files.slice(i, i + 500) });
}
const done = await api("POST", "/rest/v1/rpc/purge_data", { p_kind: kind, p_id: id, p_dry_run: false });
console.log("\nDone:");
for (const r of done) console.log(`  ${r.table_name}.${r.column_name}: ${r.action} ${r.row_count ?? ""}`);
console.log(`  storage: deleted ${files.length} file(s)`);
if (done.some((r) => String(r.action).startsWith("failed"))) {
  console.log("\nSome rows are still referenced by other tables; check those by hand.");
  process.exitCode = 2;
}
