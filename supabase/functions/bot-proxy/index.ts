// Forwards the Discord bot's database requests using the admin key, which stays server-side.
// Only requests carrying the correct x-bot-secret header are accepted.
const SECRET = Deno.env.get("BOT_PROXY_SECRET");
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  const given = req.headers.get("x-bot-secret") ?? "";
  if (!SECRET || SECRET.length < 24 || !safeEqual(given, SECRET)) {
    return new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 });
  }
  const path = req.headers.get("x-rest-path") ?? "";
  if (!path || path.includes("..") || path.startsWith("/") || /^https?:/i.test(path)) {
    return new Response(JSON.stringify({ message: "bad path" }), { status: 400 });
  }
  const headers = new Headers();
  for (const h of ["content-type", "prefer", "accept", "range", "accept-profile", "content-profile"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("apikey", KEY);
  headers.set("Authorization", `Bearer ${KEY}`);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { method: req.method, headers, body });
  const out = new Headers();
  for (const h of ["content-type", "content-range", "preference-applied"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers: out });
});
