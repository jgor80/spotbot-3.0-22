// Copies XI Lab's engine (jgor80/11-lab: src/chemistry, src/workspace, src/market, src/intelligence, src/shared) into
// supabase/functions/_shared/fut/xilab/, so the fut-api function and the MCP FUT tools run the exact code
// XI Lab tests. Never edit the copies by hand: change XI Lab, then re-run
//   node scripts/sync-xilab.mjs ../11-lab
// The XI Lab files are written to run in a Worker (no Node-only imports); this only rewrites their
// relative ".js" imports to ".ts" for Deno, points zod at npm:zod@3 and stamps the source commit on top.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(process.argv[2] || "../11-lab");
const DIRS = ["chemistry", "workspace", "market", "intelligence", "shared"];
const OUT = "supabase/functions/_shared/fut/xilab";
if (!existsSync(join(repo, "src/chemistry/index.ts"))) {
  console.error(`No XI Lab engine at ${repo}/src/chemistry. Pass the path to an 11-lab checkout.`);
  process.exit(1);
}
const sha = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"]).toString().trim();
const dirty = execFileSync("git", ["-C", repo, "status", "--porcelain", "src"]).toString().trim() ? " (with uncommitted changes)" : "";

rmSync(OUT, { recursive: true, force: true });
let count = 0;
for (const dir of DIRS) {
  const src = join(repo, "src", dir);
  if (!existsSync(src)) continue;
  mkdirSync(join(OUT, dir), { recursive: true });
  for (const file of readdirSync(src).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const code = readFileSync(join(src, file), "utf8");
    if (/from\s+["'](node:|fs|path)/.test(code)) throw new Error(`${dir}/${file} imports a Node module; XI Lab's engine must stay runtime-neutral.`);
    const out = code
      .replace(/(from\s+["'])(\.{1,2}\/[^"']+)\.js(["'])/g, "$1$2.ts$3")
      // XI Lab pins zod 4 but only uses APIs zod 3 has; GafferBot's functions use npm:zod@3 (bundled from node_modules).
      .replace(/(from\s+["'])zod(["'])/g, "$1npm:zod@3$2");
    const bare = out.match(/from\s+["']([^."'][^"']*)["']/g)?.filter((m) => !/npm:zod@3/.test(m));
    if (bare?.length) throw new Error(`${dir}/${file} imports ${bare.join(", ")}; only relative imports and zod are supported.`);
    writeFileSync(join(OUT, dir, file), `// GENERATED from jgor80/11-lab@${sha}${dirty} src/${dir}/${file} by scripts/sync-xilab.mjs. Do not edit.\n${out}`);
    count++;
  }
}
console.log(`Copied ${count} XI Lab files from 11-lab@${sha}${dirty} into ${OUT}`);
