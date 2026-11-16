// The signed-in member's saved builds (player-cards function: builds_list / build_save / build_delete /
// build_cards) and their own pro photo for the build card (pro-photo function: web_list).
// The build marked "on my cards" is what Graphics Studio prints on "With My Build" cards and build backs.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, FolderOpen, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ARCHETYPES, decodeBuild, encodeBuild, type Build, type ProProfile, type Units } from "@/lib/proBuild";

export interface SavedBuild { id: string; name: string; code: string; archetype: string; level: number; on_cards: boolean; units: Units; updated_at: string }
interface BuildsResponse { builds: SavedBuild[]; levels: Record<string, number>; profile: ProProfile | null; id?: string }

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error || "Something went wrong. Try again in a minute.");
  }
  return data as T;
}

export function useMyBuilds() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["my-builds", user?.id];
  const list = useQuery({
    queryKey: key,
    queryFn: () => call<BuildsResponse>("player-cards", { action: "builds_list" }),
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  });
  const set = (r: BuildsResponse) => qc.setQueryData(key, r);
  const save = useMutation({
    mutationFn: (v: { build: Build; id?: string; onCards?: boolean; units: Units }) =>
      call<BuildsResponse>("player-cards", { action: "build_save", code: encodeBuild(v.build), ...(v.id ? { id: v.id } : {}), ...(v.onCards ? { on_cards: true } : {}), units: v.units }),
    onSuccess: set,
  });
  const remove = useMutation({ mutationFn: (id: string) => call<BuildsResponse>("player-cards", { action: "build_delete", id }), onSuccess: set });
  const onCards = useMutation({ mutationFn: (v: { id: string | null; units: Units }) => call<BuildsResponse>("player-cards", { action: "build_cards", id: v.id, units: v.units }), onSuccess: set });
  // Masteries and club facility boosts, saved once and applied to every build
  const saveProfile = useMutation({
    mutationFn: (p: ProProfile) => call<BuildsResponse>("player-cards", { action: "build_profile", mastery_levels: p.masteryLevels, boosts: p.boosts }),
    onSuccess: set,
  });
  return { signedIn: !!user, list, save, remove, onCards, saveProfile };
}

// The member's best photo for a card: their face headshot, else the newest upload. Returned as a data URL
// so the card SVG can be saved as a PNG (a remote image would taint the canvas).
export function useMyProPhoto(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["build-card-photo", user?.id],
    enabled: enabled && !!user,
    retry: false,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const r = await call<{ photos: { id: string; pose: string | null; image_url: string | null }[] }>("pro-photo", { action: "web_list" });
      const pick = r.photos.find((p) => p.pose === "profile" && p.image_url) ?? r.photos.find((p) => p.image_url);
      if (!pick?.image_url) return null;
      const blob = await (await fetch(pick.image_url)).blob();
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    },
  });
}

const archName = (k: string) => ARCHETYPES.find((a) => a.key === k)?.name ?? k;
const btn = "inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/30 hover:text-white disabled:opacity-40";

export function MyBuildsPanel({
  build,
  currentId,
  units,
  onOpen,
  onSaved,
  accent,
}: {
  build: Build;
  currentId: string | null;
  units: Units;
  onOpen: (b: Build, id: string) => void;
  onSaved: (id: string) => void;
  accent: string;
}) {
  const { signedIn, list, save, remove, onCards } = useMyBuilds();
  if (!signedIn)
    return (
      <p className="text-sm text-slate-400">
        <a href="/auth?next=/build" className="underline hover:text-white">
          Sign in with Discord
        </a>{" "}
        to save builds, see the level of every archetype you've built, and put a build on your Graphics Studio cards.
      </p>
    );
  const builds = list.data?.builds ?? [];
  const levels = list.data?.levels ?? {};
  const err = (list.error || save.error || remove.error || onCards.error) as Error | null;
  const current = builds.find((b) => b.id === currentId);
  const doSave = (asNew: boolean, cards = false) =>
    save.mutate({ build, id: asNew ? undefined : currentId ?? undefined, onCards: cards || current?.on_cards, units }, { onSuccess: (r) => r.id && onSaved(r.id) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className={btn} style={{ borderColor: `${accent}88` }} disabled={save.isPending} onClick={() => doSave(!current)}>
          <Save className="h-3.5 w-3.5" /> {current ? `Update "${current.name || archName(current.archetype)}"` : "Save this build"}
        </button>
        {current && (
          <button className={btn} disabled={save.isPending} onClick={() => doSave(true)}>
            Save as new
          </button>
        )}
        <button className={btn} disabled={save.isPending} onClick={() => doSave(!current, true)}>
          <CreditCard className="h-3.5 w-3.5" /> Save and use on my cards
        </button>
      </div>
      {err && <p className="text-xs text-rose-300">{err.message}</p>}
      {Object.keys(levels).length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Archetype levels from your builds</div>
          <div className="flex flex-wrap gap-1.5">
            {ARCHETYPES.filter((a) => levels[a.key]).map((a) => (
              <span key={a.key} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-slate-200">
                {a.name} <b className="tabular-nums text-white">{levels[a.key]}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {list.isLoading ? (
        <p className="text-xs text-slate-500">Loading your builds...</p>
      ) : builds.length === 0 ? (
        <p className="text-xs text-slate-500">No saved builds yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-black/20">
          {builds.map((s) => (
            <li key={s.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${s.id === currentId ? "bg-white/[0.04]" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-white">{s.name || archName(s.archetype)}</div>
                <div className="text-xs text-slate-400">
                  {archName(s.archetype)} · level {s.level}
                  {s.on_cards && <span className="ml-2 rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">On my cards</span>}
                </div>
              </div>
              <button
                className={btn}
                onClick={() => {
                  const b = decodeBuild(s.code);
                  if (b) onOpen(b, s.id);
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" /> Open
              </button>
              <button className={btn} disabled={onCards.isPending} onClick={() => onCards.mutate({ id: s.on_cards ? null : s.id, units })}>
                <CreditCard className="h-3.5 w-3.5" /> {s.on_cards ? "Take off cards" : "Use on cards"}
              </button>
              <button className={btn} aria-label={`Delete ${s.name || archName(s.archetype)}`} disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        The build on your cards shows up in Graphics Studio in Discord: pick <b className="text-slate-300">With My Build</b> for a card with your attributes instead of stats, or
        set the back of card to <b className="text-slate-300">My build</b>.
      </p>
    </div>
  );
}
