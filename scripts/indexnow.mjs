// Tells Bing (and through IndexNow also Yandex, Seznam, Naver; Bing feeds ChatGPT search and Copilot)
// about gafferbot.app's public pages, so new and changed pages are picked up in hours, not weeks.
// Runs from .github/workflows/indexnow.yml after each deploy (every page in the sitemap) and daily
// (--only-hubs: the public Social Hub pages, whose content changes with live data).
// The key is public by design: IndexNow checks it at https://gafferbot.app/<key>.txt.
const SITE = process.env.SITE_URL || "https://gafferbot.app";
const KEY = "edec80c6455e067319451aeadbd8ec34";
const onlyHubs = process.argv.includes("--only-hubs");
const dryRun = process.argv.includes("--dry-run");

async function waitForKeyFile() {
  // A fresh deploy can take a few minutes to go live; the key file only exists once it has.
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${SITE}/${KEY}.txt`, { cache: "no-store" }).catch(() => null);
    if (res?.ok && (await res.text()).trim() === KEY) return;
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error("IndexNow key file is not live on the site");
}

if (!dryRun) await waitForKeyFile();
const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text();
let urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (onlyHubs) urls = urls.filter((u) => u.includes("/play/"));
if (!urls.length) {
  console.log("IndexNow: nothing to submit");
  process.exit(0);
}
console.log(`IndexNow: ${urls.length} URLs\n${urls.join("\n")}`);
if (dryRun) process.exit(0);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow answered ${res.status} ${await res.text()}`);
// 200 OK and 202 Accepted (key still being checked) are both fine
if (![200, 202].includes(res.status)) process.exit(1);
