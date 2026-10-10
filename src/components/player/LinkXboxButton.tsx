import { useState } from "react";
import { Gamepad2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export async function startXboxLink() {
  const { data } = await supabase.functions.invoke("auth-xbox", { method: "GET" });
  if (!data?.client_id) throw new Error("Xbox linking isn't set up yet.");
  const state = crypto.randomUUID();
  sessionStorage.setItem("xbox_oauth_state", state);
  const params = new URLSearchParams({
    client_id: data.client_id,
    response_type: "code",
    redirect_uri: `${window.location.origin}/auth/xbox`,
    scope: "XboxLive.signin",
    state,
    prompt: "select_account",
  });
  window.location.href = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`;
}

export function LinkXboxButton({ gamertag }: { gamertag?: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await startXboxLink(); } catch (e) { toast.error((e as Error).message); setBusy(false); }
      }}
    >
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gamepad2 className="mr-2 h-4 w-4" />}
      {gamertag ? `Xbox: ${gamertag} · Refresh` : "Link Xbox gamertag"}
    </Button>
  );
}
