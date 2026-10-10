import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function XboxCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const p = new URLSearchParams(window.location.search);
      const code = p.get("code");
      const state = p.get("state");
      if (p.get("error")) return setError("Xbox linking was cancelled.");
      if (!code || !state || state !== sessionStorage.getItem("xbox_oauth_state")) return setError("Link is invalid or expired. Please try again.");
      sessionStorage.removeItem("xbox_oauth_state");
      const { data, error } = await supabase.functions.invoke("auth-xbox", {
        body: { code, redirect_uri: `${window.location.origin}/auth/xbox` },
      });
      if (error || !data?.gamertag) {
        let msg = data?.error;
        try { msg = msg || (await (error as any)?.context?.json())?.error; } catch { /* ignore */ }
        return setError(msg || "Xbox linking failed. Please try again.");
      }
      setTag(data.gamertag);
      setTimeout(() => navigate("/profile", { replace: true }), 1500);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      {error ? (
        <>
          <p className="text-destructive">{error}</p>
          <Button onClick={() => navigate("/profile")}>Back to profile</Button>
        </>
      ) : tag ? (
        <p className="text-foreground">Linked Xbox gamertag <strong>{tag}</strong></p>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Reading your gamertag from Xbox…</p>
        </>
      )}
    </div>
  );
}
