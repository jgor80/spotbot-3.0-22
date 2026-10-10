import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// The Supabase backend is baked in at build time. Build env vars (e.g. Cloudflare
// build variables) win over the committed .env, which Lovable manages for its own
// preview. VITE_SUPABASE_ANON_KEY is accepted as an alias for the publishable key.
function supabaseEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Default to the self-hosted Hetzner backend. The old managed backend
  // (disconnected) is ignored even if a stale .env still names it. The
  // publishable anon key is safe to embed — it ships in the client bundle.
  const HETZNER_URL = "https://supabasekong-xue3q5tb1udz4bvq6oxbg1pv.65.108.243.142.sslip.io";
  const HETZNER_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5MTU5OTk0MCwiZXhwIjo0OTQ3MjczNTQwLCJyb2xlIjoiYW5vbiJ9.-X11YfReZMSSz405K0Q1GLsDKc-4gVXttKYlxR22U50";
  const stale = !env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL.includes("vynlrqlisrvuejwawaxh");
  const rawUrl = stale ? HETZNER_URL : env.VITE_SUPABASE_URL;
  // Remote backends must be HTTPS or browsers block every request on https pages.
  const url = /^http:\/\/(localhost|127\.)/.test(rawUrl) ? rawUrl : rawUrl.replace(/^http:\/\//, "https://");
  const key = stale ? HETZNER_KEY : (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || HETZNER_KEY);
  // A hosted Supabase key names its project; refuse to pair it with another backend's URL.
  let ref: string | undefined;
  try { ref = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).ref; } catch { /* not a JWT */ }
  if (ref && !url.includes(`${ref}.supabase.co`)) {
    throw new Error(`VITE_SUPABASE_URL is ${url} but the anon key belongs to ${ref}.supabase.co; set the matching key.`);
  }
  console.log(`Supabase backend: ${url}`);
  return { url, key };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const supabase = supabaseEnv(mode);
  return {
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabase.url),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabase.key),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the big libraries into their own files so they cache across deploys.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
  };
});
