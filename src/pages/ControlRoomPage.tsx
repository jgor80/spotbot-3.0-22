// Control Room: every /manager and /me panel button from Discord, pressed from the web.
// Each press runs inside the bot as the signed-in user's Discord account (web-panel function),
// so the same handlers, permissions and stored settings apply. Private replies show here;
// public ones are posted in the picked channel, exactly as from Discord.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Radio, Trash2 } from "lucide-react";
import { DashboardLayout, PageHeader } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ActionForm, type FormValues } from "@/components/control/ActionForm";
import { BotMessageView } from "@/components/control/BotMessageView";
import { BotModalDialog, type ModalValues } from "@/components/control/BotModalDialog";
import { ChannelPicker } from "@/components/control/Pickers";
import { useGuild } from "@/contexts/GuildContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { webPanel, type ApiObject, type BotMessage, type MentionNames, type PanelAction, type PanelArea, type RunResult } from "@/lib/webPanel";

const EMPTY_NAMES: MentionNames = { users: {}, channels: {}, roles: {} };
const STYLE: Record<PanelAction["style"], string> = {
  primary: "border-primary/50 bg-primary/10 hover:bg-primary/20",
  success: "border-green-600/50 bg-green-600/10 hover:bg-green-600/20",
  danger: "border-destructive/50 bg-destructive/10 hover:bg-destructive/20",
  secondary: "border-border/60 bg-card hover:bg-muted",
};

function storedChannel(guildId: string) {
  try {
    return localStorage.getItem(`controlRoomChannel:${guildId}`);
  } catch {
    return null;
  }
}

export default function ControlRoomPage() {
  const { selectedGuildId: guildId } = useGuild();
  const { toast } = useToast();
  const { data: ctx, isLoading, error } = useQuery({
    queryKey: ["web-panel-context", guildId],
    queryFn: () => webPanel.context(guildId!),
    enabled: !!guildId,
    staleTime: 60_000,
    retry: false,
  });

  const [areaKey, setAreaKey] = useState<string>("me");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [formAction, setFormAction] = useState<PanelAction | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [feed, setFeed] = useState<BotMessage[]>([]);
  const [names, setNames] = useState<MentionNames>(EMPTY_NAMES);
  const [modal, setModal] = useState<{ runId: string; json: ApiObject } | null>(null);
  const [working, setWorking] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // New server: clear replies, pick the remembered channel and the right first area
  useEffect(() => {
    setFeed([]);
    setNames(EMPTY_NAMES);
    setModal(null);
    if (!ctx) return;
    const saved = storedChannel(ctx.guild.id);
    setChannelId(ctx.channels.some((c) => c.id === saved && c.canSend) ? saved : ctx.defaultChannelId);
    setAreaKey(ctx.leader ? "events" : "me");
  }, [ctx]);

  const pickChannel = (id: string) => {
    setChannelId(id);
    try {
      if (guildId) localStorage.setItem(`controlRoomChannel:${guildId}`, id);
    } catch {
      /* private window: just don't remember it */
    }
  };

  // Show a run's replies (newest first, an edited reply stays where it was) and keep following slow ones
  const apply = useCallback(
    async function applyResult(res: RunResult): Promise<void> {
      if (!alive.current) return;
      setNames((n) => ({ users: { ...n.users, ...res.names.users }, channels: { ...n.channels, ...res.names.channels }, roles: { ...n.roles, ...res.names.roles } }));
      setFeed((list) => {
        const next = [...list];
        for (const m of res.messages) {
          const i = next.findIndex((x) => x.id === m.id);
          if (i >= 0) next[i] = m;
          else next.unshift(m);
        }
        return next;
      });
      if (res.modal) setModal({ runId: res.runId, json: res.modal.json });
      if (res.error) toast({ title: "Something went wrong", description: res.error, variant: "destructive" });
      if (!res.done && !res.modal && guildId) {
        setWorking((w) => w + 1);
        try {
          await applyResult(await webPanel.poll(guildId, res.runId));
        } catch (err) {
          toast({ title: "Lost track of that action", description: (err as Error).message, variant: "destructive" });
        } finally {
          setWorking((w) => w - 1);
        }
      } else if (res.done && !res.messages.length && !res.modal && !res.error) {
        toast({ title: "Done" });
      }
    },
    [guildId, toast]
  );

  const fail = (err: unknown) => toast({ title: "Couldn't do that", description: (err as Error).message, variant: "destructive" });

  const runAction = async (action: PanelAction, values: FormValues = {}) => {
    if (!guildId) return;
    setRunning(action.id);
    try {
      const res = await webPanel.run(guildId, action.id, values, channelId);
      setFormAction(null);
      if (window.innerWidth < 1024) feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      await apply(res);
    } catch (err) {
      fail(err);
    } finally {
      setRunning(null);
    }
  };

  const press = (action: PanelAction) => {
    if (action.fields.length && (action.ask || action.fields.some((f) => f.required))) setFormAction(action);
    else void runAction(action);
  };

  const click = async (messageId: string, customId: string, values?: string[]) => {
    if (!guildId) return;
    try {
      await apply(await webPanel.click(guildId, messageId, customId, values));
    } catch (err) {
      fail(err);
    }
  };

  const submitModal = async (values: ModalValues) => {
    if (!guildId || !modal) return;
    try {
      const res = await webPanel.submit(guildId, modal.runId, values);
      setModal(null);
      await apply(res);
    } catch (err) {
      fail(err);
    }
  };

  const areas: PanelArea[] = ctx ? [ctx.player, ...ctx.areas] : [];
  const area = areas.find((a) => a.key === areaKey) || areas[0];
  const visible = (a: PanelArea) => a.key === "me" || ctx?.leader || a.actions.some((x) => !x.denied);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="Control Room"
          description="Every GafferBot panel button from Discord, here. It runs as you, with your Discord permissions."
        />

        {!guildId && <p className="text-sm text-muted-foreground">Pick a server at the top first.</p>}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your server's tools…
          </div>
        )}
        {error && (
          <Card className="border-destructive/40">
            <CardContent className="space-y-2 p-4 text-sm">
              <p className="font-medium">{(error as Error).message}</p>
              <p className="text-muted-foreground">
                The Control Room acts as your Discord account. Sign in with Discord (or link it in <Link to="/settings" className="text-primary hover:underline">Settings</Link>) and make sure you're in this server.
              </p>
            </CardContent>
          </Card>
        )}

        {ctx && area && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="min-w-0 space-y-4">
              <Card>
                <CardContent className="space-y-1.5 p-4">
                  <Label>Anything GafferBot posts goes to</Label>
                  <ChannelPicker channels={ctx.channels} value={channelId} onChange={pickChannel} sendableOnly />
                  <p className="text-xs text-muted-foreground">
                    Like pressing the button in that channel. Replies only you would see in Discord show here instead.
                    {ctx.voiceChannelId ? " You're in a voice channel on Discord, so voice tools will use it." : ""}
                  </p>
                </CardContent>
              </Card>

              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div className="flex w-max gap-2 pb-1 sm:w-auto sm:flex-wrap" role="tablist">
                  {areas.filter(visible).map((a) => (
                    <button
                      key={a.key}
                      role="tab"
                      aria-selected={a.key === area.key}
                      onClick={() => setAreaKey(a.key)}
                      className={cn(
                        "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        a.key === area.key ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {a.emoji} {a.label}
                    </button>
                  ))}
                </div>
              </div>
              {!ctx.leader && <p className="text-xs text-muted-foreground">Club tools appear here for captains, managers and admins.</p>}

              <div>
                <p className="mb-3 text-sm text-muted-foreground">{area.blurb}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {area.actions.map((a) => {
                    const blocked = a.denied || a.discordOnly;
                    return (
                      <button
                        key={a.id}
                        disabled={!!blocked || !!running || !channelId}
                        title={blocked || a.hint || undefined}
                        onClick={() => press(a)}
                        className={cn(
                          "flex min-h-[56px] items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          STYLE[a.style]
                        )}
                      >
                        <span className="text-lg leading-none">{running === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : a.emoji}</span>
                        <span className="min-w-0">
                          <span className="block leading-tight">{a.label}</span>
                          {a.discordOnly && <span className="block text-[11px] font-normal text-muted-foreground">Discord only</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div ref={feedRef} className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Radio className="h-4 w-4 text-primary" /> Replies
                  {working > 0 && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </h2>
                {feed.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setFeed([])} className="gap-1 text-muted-foreground">
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>
              {feed.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">Press a tool and GafferBot's reply shows up here, with its buttons still working.</CardContent>
                </Card>
              ) : (
                feed.map((m) => <BotMessageView key={m.id} message={m} names={names} guildId={ctx.guild.id} channels={ctx.channels} onClick={click} />)
              )}
            </div>
          </div>
        )}
      </div>

      {ctx && (
        <>
          <ActionForm
            action={formAction}
            ctx={ctx}
            channelId={channelId}
            open={!!formAction}
            onOpenChange={(o) => !o && setFormAction(null)}
            onSubmit={(values) => (formAction ? runAction(formAction, values) : Promise.resolve())}
          />
          <BotModalDialog modal={modal?.json ?? null} ctx={ctx} onClose={() => setModal(null)} onSubmit={submitModal} />
        </>
      )}
    </DashboardLayout>
  );
}
