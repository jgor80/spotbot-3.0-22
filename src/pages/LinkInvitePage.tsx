import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InviteInfo {
  discord_username: string | null;
  guild_name: string | null;
  ea_username: string | null;
  ea_platform: string | null;
}

const PLATFORMS = [
  { value: "ps5", label: "PlayStation 5" },
  { value: "xbox-series-xs", label: "Xbox Series X|S" },
  { value: "pc", label: "PC" },
  { value: "switch", label: "Nintendo Switch" },
];

async function errorText(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    return body?.error ?? "Something went wrong.";
  }
  return (error as Error).message;
}

// Page opened from the bot's one-time DM link: confirm gamertag + platform, optionally connect the website account
export default function LinkInvitePage() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [gamertag, setGamertag] = useState("");
  const [platform, setPlatform] = useState("ps5");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ website: boolean } | null>(null);

  useEffect(() => {
    supabase.functions.invoke("redeem-link-invite", { body: { action: "peek", token } }).then(async ({ data, error }) => {
      if (error) return setError(await errorText(error));
      setInfo(data);
      setGamertag(data.ea_username ?? "");
      if (data.ea_platform && PLATFORMS.some((p) => p.value === data.ea_platform)) setPlatform(data.ea_platform);
    });
  }, [token]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("redeem-link-invite", {
      body: { action: "redeem", token, ea_username: gamertag, ea_platform: platform },
    });
    setSaving(false);
    if (error) return setError(await errorText(error));
    setDone({ website: !!data?.website_linked });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Link your accounts</CardTitle>
          <CardDescription>
            {info
              ? `Hi ${info.discord_username ?? "there"}${info.guild_name ? ` from ${info.guild_name}` : ""}. Confirm your EA gamertag so your stats count.`
              : "Loading your invite…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
              <p className="font-medium">You're linked as {gamertag}.</p>
              <p className="text-sm text-muted-foreground">
                {done.website ? "Your website account is connected too." : "Your stats will show up in Discord after your next match."}
              </p>
              <Button asChild className="w-full"><Link to={user ? "/profile" : "/auth"}>{user ? "Go to my profile" : "Open the website"}</Link></Button>
            </div>
          ) : !info && !error ? (
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          ) : info ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="gt">EA gamertag</Label>
                <Input id="gt" value={gamertag} onChange={(e) => setGamertag(e.target.value)} placeholder="Exactly as it shows in game" maxLength={24} />
              </div>
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {user ? (
                <p className="text-sm text-muted-foreground">Signed in as {user.email}. This website account will be connected too.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Want to see your stats on the website as well?{" "}
                  <Link className="text-primary underline" to={`/auth?next=/link/${token}`}>Sign in or create an account first</Link>.
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={save} disabled={saving || gamertag.trim().length < 2}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
              </Button>
            </>
          ) : (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
