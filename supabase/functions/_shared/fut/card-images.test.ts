import { cardImages, resetCardImages } from "./card-images.ts";

const assert = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
const page = `<script>window.fut_guid = "ABCDEF12-3456";window.fut_year = "2027";</script>`;

Deno.test("card images: off unless FUT_EA_FACES=on, and never fetch EA while off", async () => {
  resetCardImages();
  let calls = 0;
  const fetcher = () => { calls++; return Promise.resolve(new Response(page)); };
  for (const v of [undefined, "", "off", "true"]) {
    const r = await cardImages((k) => (k === "FUT_EA_FACES" ? v : undefined), fetcher);
    assert(!r.faces && r.portrait_base === null, `off for ${v}`);
  }
  assert(calls === 0, "no EA lookups while off");
});

Deno.test("card images: finds the Web App folder, caches it and keeps it through a failed lookup", async () => {
  resetCardImages();
  let calls = 0, fail = false;
  const fetcher = () => { calls++; return fail ? Promise.reject(new Error("down")) : Promise.resolve(new Response(page)); };
  const env = (k: string) => (k === "FUT_EA_FACES" ? "On" : undefined);
  const r = await cardImages(env, fetcher, 0);
  assert(r.faces && r.portrait_base === "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/ABCDEF12-3456/2027/fut/items/images/mobile/portraits/", `base ${r.portrait_base}`);
  assert(r.background_base === "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/ABCDEF12-3456/2027/fut/items/images/backgrounds/itemBGs/large/", `bg ${r.background_base}`);
  assert(r.credit?.includes("EA"), "credit");
  assert((await cardImages((k) => (k === "FUT_EA_IMAGES" ? "on" : undefined), fetcher, 60_000)).faces, "FUT_EA_IMAGES works too");
  await cardImages(env, fetcher, 60_000);
  assert(calls === 1, "cached");
  fail = true;
  const later = await cardImages(env, fetcher, 7 * 3_600_000);
  assert(calls === 2 && later.faces && later.portrait_base === r.portrait_base, "kept the old folder");
});

Deno.test("card images: no faces when EA can't be reached and nothing was cached", async () => {
  resetCardImages();
  const r = await cardImages(() => "on", () => Promise.resolve(new Response("no ids here")));
  assert(!r.faces && r.portrait_base === null, "off without a folder");
});
