// Packs the XI Lab helper (browser extension) from a jgor80/11-lab checkout into public/downloads/xi-lab-helper.zip,
// the file the site's "Download helper" button serves. Run after the helper changes in 11-lab:
//   (cd ../11-lab && npm ci) && node scripts/build-xilab-helper.mjs ../11-lab
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const lab = resolve(process.argv[2] ?? "../11-lab");
const ext = join(lab, "extension");
if (!existsSync(join(ext, "manifest.json"))) throw new Error(`No extension/manifest.json in ${lab}`);
execFileSync("node", ["scripts/build-extension.mjs"], { cwd: lab, stdio: "inherit" });
const out = resolve("public/downloads/xi-lab-helper.zip");
mkdirSync(resolve("public/downloads"), { recursive: true });
rmSync(out, { force: true });
// -X: no extra file attributes, so rebuilding unchanged files gives the same zip.
execFileSync("zip", ["-q", "-X", "-r", out, "manifest.json", "popup.html", "dist"], { cwd: ext, stdio: "inherit" });
const { version } = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: lab }).toString().trim();
writeFileSync(resolve("src/components/fut/helperVersion.ts"),
  `// Written by scripts/build-xilab-helper.mjs. The helper in public/downloads/xi-lab-helper.zip.\nexport const HELPER_VERSION = "${version}";\nexport const HELPER_COMMIT = "${commit}";\n`);
console.log(`Packed XI Lab helper ${version} (11-lab ${commit}) into public/downloads/xi-lab-helper.zip`);
