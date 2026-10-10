import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";

// On gafferbot.app backend functions run on our own server; the Worker forwards /api/functions/* there.
if (!/(^|\.)(lovable\.app|lovableproject\.com)$/.test(window.location.hostname)) {
  (supabase.functions as unknown as { url: string }).url = `${window.location.origin}/api/functions/v1`;
}

createRoot(document.getElementById("root")!).render(<App />);
