import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

// Plans and image packs for one Discord server (the billing function). The same products are on sale
// in Discord's store at the same price, and both land on the same server balance.
type Product = { key: string; type: "monthly" | "once" | "pack"; name: string; price: number; images: number; daily_after: number | null; web: boolean; discord_sku: string | null };
type Status = { limits_on: boolean; tier: string; plan: string; used: number; monthly: number; pack_balance: number; left: number; products: Product[] };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("billing", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error || "Billing is unavailable right now.");
  }
  return data as T;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function describe(p: Product) {
  if (p.type === "pack") return `${p.images} AI images that never expire`;
  if (p.type === "once") return `Premium features for good, plus ${p.images} AI images`;
  return `${p.images} AI images a month${p.daily_after ? `, then ${p.daily_after} a day` : ""}, plus the premium features`;
}

export default function BillingPage() {
  const [params] = useSearchParams();
  const { selectedGuildId, setSelectedGuildId, selectedGuild } = useGuild();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const linked = params.get("guild");

  // A link from Discord names its server; switch to it
  useEffect(() => {
    if (linked && /^\d{5,25}$/.test(linked) && linked !== selectedGuildId) setSelectedGuildId(linked);
  }, [linked, selectedGuildId, setSelectedGuildId]);
  useEffect(() => {
    if (params.get("done")) toast({ title: "Thanks for your purchase", description: "It can take a minute to show up here and in Discord." });
  }, [params, toast]);

  const status = useQuery({
    queryKey: ["billing", selectedGuildId],
    enabled: !!selectedGuildId,
    queryFn: () => call<Status>({ action: "web_status", guild_id: selectedGuildId }),
  });

  const buy = async (product: string) => {
    if (!selectedGuildId) return;
    setBusy(product);
    try {
      const { url } = await call<{ url: string }>({ action: "web_checkout", guild_id: selectedGuildId, product });
      window.location.assign(url);
    } catch (e) {
      toast({ title: "Couldn't start checkout", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setBusy(null);
    }
  };

  const s = status.data;
  const groups: [string, Product["type"][]][] = [["Plans", ["once", "monthly"]], ["Image packs", ["pack"]]];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Plans & AI Images</h1>
          <p className="text-muted-foreground">
            For {selectedGuild?.name ?? "your server"}. Everything else in GafferBot is free; plans and packs pay for the AI artwork.
            Cards use 1 image; posters, lineups and banners use 2. The same plans are in Discord's store at the same price.
          </p>
        </div>

        {!selectedGuildId ? (
          <Card className="p-6 text-muted-foreground">Pick a server at the top first.</Card>
        ) : status.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : status.isError || !s ? (
          <p className="text-destructive">{status.error instanceof Error ? status.error.message : "Couldn't load this server's plan."}</p>
        ) : (
          <>
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">Current plan</p>
                <p className="text-2xl font-semibold">{s.plan}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">AI images left</p>
                <p className="text-2xl font-semibold">{s.limits_on ? s.left : "Unlimited for now"}</p>
                {s.limits_on && (
                  <p className="text-xs text-muted-foreground">
                    {s.monthly ? `${Math.max(0, s.monthly - s.used)} of ${s.monthly} this month · ` : ""}{s.pack_balance} from packs
                  </p>
                )}
              </div>
            </Card>

            {groups.map(([title, types]) => {
              const items = s.products.filter((p) => types.includes(p.type));
              if (!items.length) return null;
              return (
                <section key={title} className="space-y-3">
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((p) => (
                      <Card key={p.key} className="flex flex-col gap-3 p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{p.name}</span>
                          {s.tier === p.key && <Badge>Current</Badge>}
                        </div>
                        <p className="text-2xl font-bold">
                          {money(p.price)}
                          {p.type === "monthly" && <span className="text-sm font-normal text-muted-foreground"> / month</span>}
                          {p.type === "once" && <span className="text-sm font-normal text-muted-foreground"> once</span>}
                        </p>
                        <p className="flex-1 text-sm text-muted-foreground">{describe(p)}</p>
                        {p.web ? (
                          <Button onClick={() => buy(p.key)} disabled={!!busy || s.tier === p.key}>
                            {busy === p.key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {p.type === "monthly" ? "Subscribe" : "Buy"}
                          </Button>
                        ) : (
                          <p className="text-xs text-muted-foreground">{p.discord_sku ? "Available in Discord's store." : "Coming soon."}</p>
                        )}
                      </Card>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
