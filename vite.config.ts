import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// The Supabase backend is baked in at build time. Build env vars (e.g. Cloudflare
// build variables) win over the committed .env, which Lovable manages for its own
// preview. VITE_SUPABASE_ANON_KEY is accepted as an alias for the publishable key.
function supabaseEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Fall back to the last known backend so builds never fail when the env
  // file is absent (e.g. after disconnecting the managed backend). The
  // publishable anon key is safe to embed — it ships in the client bundle.
  const url = env.VITE_SUPABASE_URL || "https://vynlrqlisrvuejwawaxh.supabase.co";
  const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY
    || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5bmxycWxpc3J2dWVqd2F3YXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQxNTIsImV4cCI6MjA4MDkxMDE1Mn0.2ZXvGwU86EGCIC1e3Dw6sg9uV7tgwiwjr0ocUNkiHKI";
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
