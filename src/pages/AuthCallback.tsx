import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { discordAuthApi } from "@/lib/discordAuthApi";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const expected = sessionStorage.getItem("discord_oauth_state");
      if (params.get("error")) return setError("Discord sign-in was cancelled.");
      if (!code || !state || state !== expected) return setError("Sign-in link is invalid or expired. Please try again.");
      sessionStorage.removeItem("discord_oauth_state");
      const { data, error } = await discordAuthApi<{ token_hash?: string }>({
        code, redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (error || !data?.token_hash) return setError(error || "Discord sign-in failed. Please try again.");
      const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
      if (vErr) return setError(vErr.message);
      const next = sessionStorage.getItem("auth_next") || "/";
      sessionStorage.removeItem("auth_next");
      navigate(next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      {error ? (
        <>
          <p className="text-destructive">{error}</p>
          <Button onClick={() => navigate("/auth")}>Back to sign in</Button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Signing you in with Discord…</p>
        </>
      )}
    </div>
  );
}
