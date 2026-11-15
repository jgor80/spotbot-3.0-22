// The self-hosted (Hetzner) Supabase backend and its publishable anon key. The anon key is public: it ships
// in the client bundle and only reaches what row-level security lets anyone read. Used as the build's
// default backend (vite.config.ts) and by the Worker to read public tables (worker/public-pages.ts).
export const PUBLIC_SUPABASE_URL = "https://supabasekong-xue3q5tb1udz4bvq6oxbg1pv.65.108.243.142.sslip.io";
export const PUBLIC_SUPABASE_ANON_KEY =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5MTU5OTk0MCwiZXhwIjo0OTQ3MjczNTQwLCJyb2xlIjoiYW5vbiJ9.-X11YfReZMSSz405K0Q1GLsDKc-4gVXttKYlxR22U50";
