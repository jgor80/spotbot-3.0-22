import { useState } from "react";
import { usePlayerCards } from "@/hooks/usePlayerCards";
import { cn } from "@/lib/utils";

export function PlayerCardArt({ discordUserId, name, className, fallback }: { discordUserId: string; name: string; className?: string; fallback?: React.ReactNode }) {
  const { data } = usePlayerCards();
  const url = data?.[discordUserId];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return <>{fallback ?? null}</>;
  return <img src={url} alt={`${name} player card`} title="Saved player card · collection stats" loading="lazy" onError={() => setFailedUrl(url)} className={cn("aspect-[5/7] object-contain rounded border border-border bg-muted", className)} />;
}