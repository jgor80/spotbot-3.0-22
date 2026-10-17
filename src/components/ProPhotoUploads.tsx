import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Loader2, Trash2 } from "lucide-react";

// The signed-in member's own pro photos: the same pro-photo function as Discord's #pro-photos and
// Studio → Upload Photos, so the same AI check, storage and artwork references apply.
type Photo = { id: string; image_url: string | null; pose: string | null; description: string | null; created_at: string };
type Shot = "headshot" | "celebration";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("pro-photo", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error || "Something went wrong. Try again in a minute.");
  }
  return data as T;
}

export function ProPhotoUploads() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [shot, setShot] = useState<Shot>("headshot");
  const [busy, setBusy] = useState<string | null>(null);

  const photos = useQuery({
    queryKey: ["pro-photos"],
    queryFn: async () => (await call<{ photos: Photo[] }>({ action: "web_list" })).photos ?? [],
  });

  const pick = (next: Shot) => {
    setShot(next);
    input.current?.click();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type as (typeof TYPES)[number])) {
      toast({ title: "Use a PNG, JPG or WebP image", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "That image is over 8 MB", variant: "destructive" });
      return;
    }
    setBusy("upload");
    try {
      const out = await call<{ accepted: boolean; error?: string; analysis?: { reason?: string } }>({
        action: "web_upload", image_b64: await toBase64(file), content_type: file.type, shot,
        ...(selectedGuildId ? { guild_id: selectedGuildId } : {}),
      });
      if (!out.accepted) {
        toast({ title: "Photo not saved", description: out.error || out.analysis?.reason || "That doesn't look like a Pro Clubs player.", variant: "destructive" });
      } else {
        toast({ title: "Photo saved", description: "New player artwork will be drawn from it." });
        await queryClient.invalidateQueries({ queryKey: ["pro-photos"] });
      }
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this photo? Cards already made from it stay as they are.")) return;
    setBusy(id);
    try {
      await call({ action: "web_delete", photo_asset_id: id });
      await queryClient.invalidateQueries({ queryKey: ["pro-photos"] });
    } catch (e) {
      toast({ title: "Couldn't delete the photo", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <p className="text-sm text-muted-foreground">
          Upload raw screenshots of your pro, or phone photos of your screen. Player cards and posters are drawn from these, so a clear,
          face-on headshot works best. AI-made or edited images are turned away.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => pick("headshot")} disabled={!!busy}>
            {busy === "upload" && shot === "headshot" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            Upload headshot
          </Button>
          <Button variant="secondary" onClick={() => pick("celebration")} disabled={!!busy}>
            {busy === "upload" && shot === "celebration" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            Upload celebration
          </Button>
        </div>
        <input ref={input} type="file" accept={TYPES.join(",")} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </Card>

      {photos.isLoading ? (
        <p className="text-muted-foreground">Loading your photos…</p>
      ) : photos.isError ? (
        <p className="text-destructive">Couldn't load your photos. Make sure your Discord account is linked.</p>
      ) : !photos.data?.length ? (
        <Card className="p-6 text-muted-foreground">No photos yet. Upload a headshot to get started.</Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.data.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              {p.image_url ? <img src={p.image_url} alt={p.description ?? "Pro photo"} className="aspect-[3/4] w-full object-cover" loading="lazy" /> : <div className="aspect-[3/4] bg-muted" />}
              <div className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0">
                  {p.pose && <Badge variant="secondary">{p.pose}</Badge>}
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Delete photo" disabled={!!busy} onClick={() => remove(p.id)}>
                  {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
