#!/usr/bin/env node
// Uploads the backed-up pro-photos bucket into the self-hosted (Hetzner) Supabase
// storage, then re-signs every stored photo URL so it points at the new backend.
//
// Signed URLs are tied to the project's JWT secret and host, so the old Lovable
// Cloud links stop working once the files move; this rewrites pro_photo_assets
// and pro_photos.image_url with fresh 10-year links (same lifetime the pro-photo
// and club-art functions use).
//
// Usage (on the Hetzner box, Node 18+, no npm install needed):
//   SUPABASE_URL=https://api.example.com \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/hetzner/upload-pro-photos.mjs /opt/spotbot/storage-backup/pro-photos [--dry-run] [--skip-upload]
//
// SUPABASE_URL must be the public Kong URL (what Discord and browsers reach),
// because it is baked into the signed links written to the database.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const BUCKET = "pro-photos";
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipUpload = args.includes("--skip-upload");
const dir = args.find((a) => !a.startsWith("--"));
const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dir || !base || !key) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node upload-pro-photos.mjs <backup-dir> [--dry-run] [--skip-upload]");
  process.exit(1);
}
if (base.includes("supabase.co")) {
  console.error(`SUPABASE_URL is ${base}; point it at the Hetzner Kong URL, not Lovable Cloud.`);
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

async function api(method, url, body, extra = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { ...headers, ...(body && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}), ...extra },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, data };
}

async function walk(root, rel = "") {
  const out = [];
  for (const entry of await readdir(path.join(root, rel), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(root, child)));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

async function ensureBucket() {
  const got = await api("GET", `/storage/v1/bucket/${BUCKET}`);
  if (got.ok) return console.log(`Bucket ${BUCKET} exists (public: ${got.data?.public}).`);
  if (dryRun) return console.log(`[dry-run] would create private bucket ${BUCKET}`);
  const made = await api("POST", "/storage/v1/bucket", { id: BUCKET, name: BUCKET, public: false });
  if (!made.ok) throw new Error(`Couldn't create bucket ${BUCKET}: ${made.status} ${JSON.stringify(made.data)}`);
  console.log(`Created private bucket ${BUCKET}.`);
}

async function upload(files) {
  let done = 0, failed = 0;
  for (const rel of files) {
    const type = TYPES[path.extname(rel).toLowerCase()] || "application/octet-stream";
    if (dryRun) { console.log(`[dry-run] upload ${rel} (${type})`); done++; continue; }
    const bytes = new Uint8Array(await readFile(path.join(dir, rel)));
    const res = await api("POST", `/storage/v1/object/${BUCKET}/${encodePath(rel)}`, bytes, { "Content-Type": type, "x-upsert": "true" });
    if (res.ok) done++;
    else { failed++; console.error(`  ✗ ${rel}: ${res.status} ${JSON.stringify(res.data)}`); }
  }
  console.log(`Uploaded ${done}/${files.length} files${failed ? `, ${failed} failed` : ""}.`);
  return failed;
}

async function sign(storagePath) {
  const res = await api("POST", `/storage/v1/object/sign/${BUCKET}/${encodePath(storagePath)}`, { expiresIn: TEN_YEARS });
  const signed = res.data?.signedURL || res.data?.signedUrl;
  if (!res.ok || !signed) return null;
  return signed.startsWith("http") ? signed : `${base}/storage/v1${signed}`;
}

async function rows(table, select) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const res = await api("GET", `/rest/v1/${table}?select=${select}&order=id`, null, { Range: `${from}-${from + 999}` });
    if (!res.ok) throw new Error(`Couldn't read ${table}: ${res.status} ${JSON.stringify(res.data)}`);
    all.push(...res.data);
    if (res.data.length < 1000) return all;
  }
}

// Old signed links look like .../storage/v1/object/sign/pro-photos/<path>?token=...
function pathFromUrl(url) {
  const m = /\/object\/(?:sign|public|authenticated)\/pro-photos\/([^?]+)/.exec(url || "");
  return m ? decodeURIComponent(m[1]) : null;
}

async function resign(table, pick, onDisk) {
  const list = await rows(table, table === "pro_photo_assets" ? "id,storage_path,image_url" : "id,image_url");
  let updated = 0, skipped = 0, missing = 0;
  for (const row of list) {
    const storagePath = pick(row);
    if (!storagePath) { skipped++; continue; } // not a pro-photos object (e.g. a Discord link)
    if (row.image_url?.startsWith(`${base}/`)) { skipped++; continue; } // already points here
    if (!onDisk.has(storagePath)) { missing++; console.warn(`  ! ${table} ${row.id}: ${storagePath} is not in the backup`); continue; }
    if (dryRun) { updated++; continue; }
    const url = await sign(storagePath);
    if (!url) { missing++; console.warn(`  ! ${table} ${row.id}: couldn't sign ${storagePath}`); continue; }
    const res = await api("PATCH", `/rest/v1/${table}?id=eq.${row.id}`, { image_url: url }, { Prefer: "return=minimal" });
    if (res.ok) updated++;
    else console.error(`  ✗ ${table} ${row.id}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  console.log(`${table}: ${dryRun ? "would re-sign" : "re-signed"} ${updated}, skipped ${skipped}, missing ${missing} (of ${list.length}).`);
}

const info = await stat(dir).catch(() => null);
if (!info?.isDirectory()) { console.error(`${dir} is not a directory`); process.exit(1); }
const files = await walk(dir);
console.log(`Found ${files.length} files in ${dir} → ${base}${dryRun ? " (dry run)" : ""}`);
if (files.length && files.every((f) => f.startsWith(`${BUCKET}/`))) {
  console.warn(`Every file sits under ${BUCKET}/; pass that inner folder so object paths match the database.`);
}

await ensureBucket();
const failed = skipUpload ? 0 : await upload(files);
const onDisk = new Set(files);
await resign("pro_photo_assets", (r) => r.storage_path || pathFromUrl(r.image_url), onDisk);
await resign("pro_photos", (r) => pathFromUrl(r.image_url), onDisk);
process.exit(failed ? 1 : 0);
