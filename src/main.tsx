import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";

// On gafferbot.app backend functions run on our own server; the Worker forwards /api/functions/* there.
// `supabase.functions` builds a fresh client from `functionsUrl` on every access, so the base URL is
// what has to change (setting `.url` on one instance is lost on the next call).
if (!/(^|\.)(lovable\.app|lovableproject\.com)$/.test(window.location.hostname)) {
  (supabase as unknown as { functionsUrl: URL }).functionsUrl = new URL(`${window.location.origin}/api/functions/v1`);
}

createRoot(document.getElementById("root")!).render(<App />);
