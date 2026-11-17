import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Minus, Plus, Link2, ImageDown, Import, RotateCcw, GitCompareArrows, X, Sparkles, Lock, Check, Info, Target, Zap, Building2, Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ARCHETYPES,
  ARCHETYPE_RULES,
  ATTRIBUTES,
  BODY,
  LEVEL_CAP,
  BOOST_MAX,
  applyProfile,
  STYLE_GROUPS,
  accelerate,
  apAtLevel,
  attrCap,
  bodyEffects,
  buildPath,
  buildSummary,
  costTier,
  decodeBuild,
  emptyBuild,
  encodeBuild,
  formatHeight,
  formatWeight,
  groupAverages,
  importProClubsBuilder,
  levelRewards,
  limitToLevel,
  apSpent,
  ESTIMATE_SOURCE,
  PLAYSTYLE_SLOT_LEVELS,
  masteryText,
  nextStarCost,
  starRule,
  RULESET,
  SPECIALIZATION_TARGETS,
  MASTERY_MILESTONES,
  isKeeper,
  masteryBonus,
  masteryLevelOf,
  matchValue,
  menuValue,
  nextSlotLevel,
  normaliseBuild,
  playstyleStatus,
  pointCost,
  raiseFor,
  specializationStatus,
  startValue,
  trainable,
  trainedValue,
  unlockValue,
  type AttrGroup,
  type Build,
  type StyleGroup,
  type ProProfile,
  type Units,
} from "@/lib/proBuild";
import { BODY_STEP, MASTERIES, SIGNATURE_PLUS_LEVELS, TIER_LABELS, UNCONFIRMED_NOTES } from "@/lib/proClubsData";
import { CommunityMetaLoader } from "@/components/build/CommunityMetaBuilds";
import { MyBuildsPanel, useMyBuilds, useMyProPhoto } from "@/components/build/MyBuilds";
import { BodyFigure, BuildCard, GROUP_COLORS, LINE_COLORS, PitchPicker, StatMeter, downloadCard, radarGroups, shapeValues } from "@/components/build/BuildVisuals";

// Accepts our links/codes and Pro Clubs Builder links
function readAnyBuild(text: string): { build: Build; skipped: string[] } | null {
  const ours = decodeBuild(text.trim().replace(/^.*[?&]b=/, "").replace(/[&#].*$/, ""));
  if (ours) return { build: ours, skipped: [] };
  return importProClubsBuilder(text);
}

const ATTR_LABEL = new Map(ATTRIBUTES.map((a) => [a.key, a.label]));
const attrLabel = (k: string) => ATTR_LABEL.get(k) ?? k;
const STYLE_COLOR: Record<StyleGroup, string> = {
  shooting: GROUP_COLORS.shooting,
  passing: GROUP_COLORS.passing,
  ballControl: GROUP_COLORS.dribbling,
  defending: GROUP_COLORS.defending,
  physical: GROUP_COLORS.physical,
  goalkeeping: GROUP_COLORS.goalkeeping,
};
const TIER_COLORS = ["", "#34d399", "#a3e635", "#fbbf24", "#fb7185"];

// What happens at each level, for the level slider (from the data tables)
const MILESTONES: [number, string][] = levelRewards().map((r) => [r.level, r.rewards.join(", ")]);
const MASTERY_LEVELS = MASTERY_MILESTONES.map((m) => m.level);

function readLimit(): boolean {
  try {
    return window.localStorage.getItem("gb-level-limit") !== "off";
  } catch {
    return true;
  }
}

// Imperial by default; the choice is remembered on this browser
function readUnits(): Units {
  try {
    return window.localStorage.getItem("gb-units") === "metric" ? "metric" : "imperial";
  } catch {
    return "imperial";
  }
}

function UnitsToggle({ value, onChange }: { value: Units; onChange: (u: Units) => void }) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-black/40 p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label="Units">
      {(["imperial", "metric"] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          onClick={() => onChange(u)}
          className={`rounded-full px-2.5 py-1 transition ${value === u ? "bg-white text-[#05080c]" : "text-slate-400 hover:text-white"}`}
        >
          {u === "imperial" ? "ft / lb" : "cm / kg"}
        </button>
      ))}
    </div>
  );
}

function Panel({ step, title, aside, children }: { step: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] backdrop-blur-xl sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-3 font-display text-xl font-bold uppercase tracking-wide text-white sm:text-2xl">
          <span className="bg-gradient-to-b from-white/50 to-white/10 bg-clip-text text-3xl text-transparent sm:text-4xl">{step}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// Stars the archetype starts with are fixed; the ones up to its maximum are bought with AP
function Stars({ value, onChange, label, min, max }: { value: number; onChange: (v: number) => void; label: string; min: number; max: number }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${label} ${n}`}
          onClick={() => onChange(Math.max(min, n))}
          className={`text-2xl leading-none transition-transform hover:scale-125 ${n <= value ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "text-white/15"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function StarPrice({ archetype, kind, stars }: { archetype: string; kind: "skillMoves" | "weakFoot"; stars: number }) {
  const next = nextStarCost(archetype, kind, stars);
  return <div className="mt-1 text-[11px] tabular-nums text-slate-500">{next === null ? `${stars}★ is this archetype's most` : `Next star ${next} AP`}</div>;
}

function Nudge({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-slate-300 transition hover:border-white/30 hover:text-white disabled:opacity-25">
      {children}
    </button>
  );
}

// Price tier as 1-4 coins: how dear this attribute is for this archetype
function TierPips({ tier }: { tier: number }) {
  return (
    <span className="flex shrink-0 gap-0.5" title={`${TIER_LABELS[tier]} for this archetype`} aria-label={`Price: ${TIER_LABELS[tier]}`}>
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className="h-1.5 w-1.5 rounded-full" style={{ background: n <= tier ? TIER_COLORS[tier] : "rgba(255,255,255,.1)" }} />
      ))}
    </span>
  );
}

const ghostBtn = "inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 disabled:opacity-40";
const label = "text-xs font-semibold uppercase tracking-widest text-slate-500";

// gafferbot.app/build: plan a Virtual Pro on FC 27's real rules, no sign-in. The whole build lives in the ?b= share code.
export default function BuildPlannerPage() {
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const [build, setBuild] = useState<Build>(() => decodeBuild(params.get("b") ?? "") ?? emptyBuild());
  const [importText, setImportText] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);
  const [compareText, setCompareText] = useState("");
  const [rival, setRival] = useState<Build | null>(null);
  const cardRef = useRef<SVGSVGElement>(null);
  const [units, setUnitsState] = useState<Units>(readUnits);
  // "Limit to my level": on, a build can't spend more AP than its level gives. Off, it can, and the page
  // says which level it needs. Remembered on this browser.
  const [limit, setLimitState] = useState<boolean>(readLimit);
  const [limitNote, setLimitNote] = useState("");
  const setUnits = (u: Units) => {
    setUnitsState(u);
    try {
      window.localStorage.setItem("gb-units", u);
    } catch {
      /* private window: keep it for this visit only */
    }
  };
  const [savedId, setSavedId] = useState<string | null>(null);
  const [usePhoto, setUsePhoto] = useState(false);
  const photo = useMyProPhoto(usePhoto);
  const mine = useMyBuilds();
  const [boostKey, setBoostKey] = useState("");
  const [boostAmt, setBoostAmt] = useState(2);
  // Signed in: masteries and facility boosts live on the player's account (saved once, applied to every build)
  const [profile, setProfile] = useState<ProProfile | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const savedLevels = useMemo(() => mine.list.data?.levels ?? {}, [mine.list.data]);
  const serverProfile = mine.list.data?.profile ?? null;
  const listLoaded = mine.signedIn && mine.list.isSuccess;
  useEffect(() => {
    if (listLoaded && !profile && serverProfile) setProfile(serverProfile);
  }, [listLoaded, serverProfile, profile]);
  // The profile (and the levels of every saved build) goes onto the build on screen
  useEffect(() => {
    if (!listLoaded) return;
    setBuild((b) => applyProfile(b, profile ?? { masteryLevels: b.masteryLevels, boosts: b.boosts }, savedLevels));
  }, [listLoaded, profile, savedLevels]);
  const saveProfile = mine.saveProfile.mutate;
  useEffect(() => {
    if (!profile || !profileDirty) return;
    const t = window.setTimeout(() => saveProfile(profile), 700);
    return () => window.clearTimeout(t);
  }, [profile, profileDirty, saveProfile]);
  // Every build that comes in (opened, imported, community, new archetype) gets the player's own masteries and boosts
  const withProfile = (b: Partial<Build>) => (profile ? applyProfile(normaliseBuild(b), profile, savedLevels) : normaliseBuild(b));

  // Keep the address bar in sync so a copied URL is always the current build
  useEffect(() => {
    const code = encodeBuild(build);
    if (params.get("b") !== code) setParams({ b: code }, { replace: true });
  }, [build, params, setParams]);

  // Edits go through the level limit when it is on (see limitToLevel)
  const edit = (change: (b: Build) => Build) => setBuild((b) => (limit ? limitToLevel(b, change(b)) : change(b)));
  const set = (patch: Partial<Build>) => edit((b) => normaliseBuild({ ...b, ...patch }));
  const setValue = (key: string, value: number) => edit((b) => normaliseBuild({ ...b, points: { ...b.points, [key]: value - startValue(b.archetype, key) } }));
  // For the one-press unlocks: say why nothing happened when the level's AP doesn't cover it
  const tryEdit = (next: Build, what: string) => {
    if (limit && limitToLevel(build, next) === build && next !== build) {
      const need = buildSummary(next);
      const where = need.levelNeeded ? `level ${need.levelNeeded}` : need.levelEstimate ? `about level ${need.levelEstimate} (estimate, past today's cap)` : "more than any level gives";
      toast({ title: `Not enough AP at level ${build.level}`, description: `${what} takes ${apSpent(next) - apSpent(build)} AP and you have ${Math.max(0, summary.remaining)} left. It needs ${where}. Turn off "Limit to my level" to plan it anyway.` });
      return;
    }
    setBuild(next);
  };
  const summary = useMemo(() => buildSummary(build), [build]);
  const needText = summary.levelNeeded
    ? `level ${summary.levelNeeded}`
    : summary.levelEstimate
      ? `about level ${summary.levelEstimate} (estimate from ${ESTIMATE_SOURCE}'s levels)`
      : "more than any level we can estimate";
  const setLimit = (on: boolean) => {
    if (on && summary.remaining < 0) {
      toast({
        title: "This build is over its level",
        description: `It spends ${-summary.remaining} AP more than level ${build.level} gives and needs ${needText}. ${summary.levelNeeded ? `Raise the level to ${summary.levelNeeded} or take` : "Take"} points off first.`,
      });
      return;
    }
    setLimitState(on);
    setLimitNote("");
    try {
      window.localStorage.setItem("gb-level-limit", on ? "on" : "off");
    } catch {
      /* private window: keep it for this visit only */
    }
  };
  // A build that arrives over budget (a link, an import, a saved or community build) is shown as it is:
  // the limit steps aside for this visit instead of silently cutting points.
  const overBudget = summary.remaining < 0;
  useEffect(() => {
    if (!limit || !overBudget) return;
    setLimitState(false);
    setLimitNote("This build spends more AP than its level gives, so the limit is off for now.");
  }, [limit, overBudget]);
  const averages = useMemo(() => groupAverages(build), [build]);
  const rivalAverages = useMemo(() => (rival ? groupAverages(rival) : null), [rival]);
  const fx = useMemo(() => bodyEffects(build), [build]);
  const accel = useMemo(() => accelerate(build, fx), [build, fx]);
  const styles = useMemo(() => playstyleStatus(build), [build]);
  const specs = useMemo(() => specializationStatus(build), [build]);
  const arch = ARCHETYPES.find((a) => a.key === build.archetype)!;
  const rules = ARCHETYPE_RULES[build.archetype];
  const body = BODY[build.archetype];
  const keeper = isKeeper(build.archetype);
  const accent = LINE_COLORS[arch.line];
  const groups = radarGroups(build);
  const values = shapeValues(averages, groups);
  const ghost = rivalAverages ? shapeValues(rivalAverages, groups) : null;
  const pointGroups = groups.filter((g) => ATTRIBUTES.some((a) => a.group === g.key && trainable(build.archetype, a.key)));
  const topGroups = summary.focus.slice(0, 2).map((f) => f.label);
  const over = summary.remaining < 0;
  const spentPct = Math.min(100, (summary.spent / apAtLevel(LEVEL_CAP)) * 100);
  const availPct = (summary.available / apAtLevel(LEVEL_CAP)) * 100;
  const activeSpec = specs.find((s) => s.spec.key === build.specialization) ?? null;
  const signatures = styles.filter((s) => s.signature).sort((a, b) => a.signature - b.signature);
  const nextSlot = nextSlotLevel(build.level);
  const mastery = MASTERIES[build.archetype];
  const boostable = ATTRIBUTES.filter((a) => trainable(build.archetype, a.key));
  const boosts = Object.entries((profile ? profile.boosts : build.boosts) ?? {}).filter(([, n]) => n > 0);
  const masteryTotals = boostable.map((a) => [a.key, masteryBonus(build, a.key)] as const).filter(([, n]) => n > 0);
  // Signed in, edits go to the account profile (saved shortly after); signed out, they stay on this build
  const editProfile = (patch: (p: ProProfile) => ProProfile) => {
    setProfile((p) => patch(p ?? { masteryLevels: { ...build.masteryLevels }, boosts: { ...build.boosts } }));
    setProfileDirty(true);
  };
  const setMastery = (k: string, n: number) => {
    const v = Math.max(0, Math.min(LEVEL_CAP, Math.round(n) || 0));
    if (listLoaded) return editProfile((p) => ({ ...p, masteryLevels: { ...p.masteryLevels, [k]: v } }));
    set({ masteryLevels: { ...build.masteryLevels, [k]: v } });
  };
  const setBoost = (k: string, n: number) => {
    const v = Math.max(0, Math.min(BOOST_MAX, n));
    if (listLoaded) return editProfile((p) => ({ ...p, boosts: { ...p.boosts, [k]: v } }));
    set({ boosts: { ...build.boosts, [k]: v } });
  };

  const share = async () => {
    const url = `${window.location.origin}${buildPath(build)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Anyone with it sees this exact build." });
    } catch {
      toast({ title: "Copy this link", description: url });
    }
  };

  const saveCard = async () => {
    if (!cardRef.current) return;
    try {
      const slug = (build.name || arch.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "build";
      await downloadCard(cardRef.current, `${slug}-gafferbot.png`);
    } catch {
      toast({ title: "Couldn't save the card", description: "Try a screenshot instead." });
    }
  };

  const doImport = () => {
    const r = readAnyBuild(importText);
    if (!r) return setImportNote("That doesn't look like a build link or code.");
    setBuild((b) => withProfile({ ...r.build, playstyles: r.build.playstyles.length ? r.build.playstyles : b.playstyles }));
    setImportNote(r.skipped.length ? `Loaded. Skipped attributes we don't know: ${r.skipped.join(", ")}.` : "Loaded.");
  };

  const doCompare = () => {
    const r = readAnyBuild(compareText);
    if (!r) return toast({ title: "Couldn't read that build", description: "Paste a GafferBot or Pro Clubs Builder link." });
    setRival(r.build);
  };

  const toggleStyle = (name: string) =>
    setBuild((b) => {
      const has = b.playstyles.includes(name);
      if (!has && b.playstyles.length >= summary.slots) return b;
      return normaliseBuild({ ...b, playstyles: has ? b.playstyles.filter((p) => p !== name) : [...b.playstyles, name] });
    });

  // Raise just what a PlayStyle needs, and take it if a slot is free
  const unlockStyle = (name: string, req: [string, number][]) => {
    const raised = raiseFor(build, req);
    const room = raised.playstyles.length < summary.slots && !raised.playstyles.includes(name);
    tryEdit(normaliseBuild({ ...raised, playstyles: room ? [...raised.playstyles, name] : raised.playstyles }), name);
  };

  const goForSpec = (key: string, req: [string, number][]) => tryEdit(normaliseBuild({ ...raiseFor(build, req), specialization: key }), "This Specialization");

  return (
    <div className="dark relative min-h-screen overflow-x-clip bg-[#05080c] font-body text-slate-200">
      {/* Stage lighting: soft colour pools that follow the archetype's line, over a faint grid */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full opacity-25 blur-[120px] transition-colors duration-700" style={{ background: accent }} />
        <div className="absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-violet-500 opacity-[0.12] blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at top, black 30%, transparent 75%)" }}
        />
      </div>

      {/* Slim AP bar that stays at the top while you scroll, above the content but out of the way of the controls */}
      <div className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#05080c]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-11 max-w-[1440px] items-center gap-3 px-4 sm:px-6 xl:px-10">
          <span className="hidden max-w-[16rem] truncate font-display text-sm font-bold uppercase tracking-wide sm:block" style={{ color: accent }}>
            {arch.name} · Lvl {build.level}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="whitespace-nowrap text-sm tabular-nums text-slate-400">
              <b className="text-white">{summary.spent}</b>/{summary.available} AP
            </span>
            <div className="relative hidden h-1.5 max-w-[240px] flex-1 overflow-hidden rounded-full bg-white/[0.08] min-[400px]:block" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${Math.min(100, (summary.spent / summary.available) * 100)}%`, background: over ? "#fb7185" : accent }} />
            </div>
            <span className={`whitespace-nowrap font-display text-sm font-bold tabular-nums ${over ? "text-rose-400" : "text-white"}`}>
              {over ? `${-summary.remaining} over` : `${summary.remaining} left`}
            </span>
          </div>
          <span className="hidden items-center gap-1 rounded-full border border-white/10 px-2.5 py-0.5 text-xs font-semibold text-slate-200 md:inline-flex" title="AcceleRATE from height, Agility, Strength and Acceleration in matches">
            <Zap className="h-3 w-3" style={{ color: accent }} /> {accel.type}
          </span>
          <div className="hidden sm:block">
            <UnitsToggle value={units} onChange={setUnits} />
          </div>
          <button className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-[#05080c] transition hover:brightness-110" style={{ background: accent }} onClick={share}>
            <Link2 className="h-3.5 w-3.5" /> Share
          </button>
        </div>
      </div>

      <div className="relative mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 sm:pt-10 xl:px-10">
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: accent }}>
              <Sparkles className="h-3.5 w-3.5" /> EA FC 27 Pro Clubs · Build lab
            </p>
            <h1 className="mt-2 font-display text-5xl font-bold leading-[0.95] text-white sm:text-6xl">
              Build your Pro.
              <br />
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${accent}, #a78bfa)` }}>
                See its shape.
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-slate-400">
              FC 27's real rules: every archetype's starting attributes and AP prices, the AP each level gives, height and weight in matches, PlayStyle unlocks,
              Signatures and Specializations. Save it as a card for your club's Discord, or line it up against a teammate's build.
            </p>
          </div>
          <div className="hidden gap-2 lg:flex">
            <button className={ghostBtn} onClick={saveCard}>
              <ImageDown className="h-4 w-4" /> Save card
            </button>
            <button className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-[#05080c] transition hover:brightness-110" style={{ background: accent, boxShadow: `0 0 28px -6px ${accent}` }} onClick={share}>
              <Link2 className="h-4 w-4" /> Copy share link
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,390px)_minmax(0,1fr)] xl:gap-8">
          {/* The live card */}
          <aside className="lg:sticky lg:top-16 lg:self-start">
            <div className="mx-auto max-w-[390px] [perspective:1200px]">
              <div className="transition-transform duration-500 hover:[transform:rotateY(-6deg)_rotateX(4deg)]" style={{ filter: `drop-shadow(0 24px 48px ${accent}33)` }}>
                <BuildCard
                  ref={cardRef}
                  build={build}
                  values={values}
                  ghost={ghost}
                  spent={summary.spent}
                  available={summary.available}
                  topGroups={topGroups}
                  signatures={signatures.map((s) => ({ name: s.def.name, plus: s.plus }))}
                  specialization={activeSpec ? { name: activeSpec.spec.name, plus: activeSpec.spec.plus, met: activeSpec.met } : null}
                  units={units}
                  accel={accel.type}
                  photo={usePhoto ? photo.data ?? null : null}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
                <button className={ghostBtn} onClick={saveCard}>
                  <ImageDown className="h-4 w-4" /> Save card
                </button>
                <button className={ghostBtn} onClick={share}>
                  <Link2 className="h-4 w-4" /> Copy link
                </button>
              </div>
              {mine.signedIn && (
                <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200">
                  <input type="checkbox" className="h-4 w-4 accent-current" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} />
                  <Camera className="h-4 w-4 text-slate-400" /> Put my pro photo on the card
                  <span className="ml-auto text-xs text-slate-500">
                    {usePhoto && photo.isLoading ? "loading..." : usePhoto && photo.isSuccess && !photo.data ? "no photo yet" : usePhoto && photo.isError ? "couldn't load" : ""}
                  </span>
                </label>
              )}
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <GitCompareArrows className="h-4 w-4" /> Compare with another build
                </div>
                {rival ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        <span className="text-slate-400">Dashed outline: </span>
                        <b className="text-white">{rival.name || ARCHETYPES.find((a) => a.key === rival.archetype)?.name}</b>
                      </span>
                      <button aria-label="Stop comparing" onClick={() => setRival(null)} className="text-slate-400 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
                      {groups.map((g) => {
                        const d = Math.round(averages[g.key] - (rivalAverages?.[g.key] ?? 0));
                        return (
                          <div key={g.key} className="flex justify-between">
                            <span style={{ color: GROUP_COLORS[g.key] }}>{g.label}</span>
                            <span className={d > 0 ? "text-emerald-400" : d < 0 ? "text-rose-400" : "text-slate-500"}>{d > 0 ? `+${d}` : d}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500">Average in-match rating per group, this build minus theirs.</p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={compareText} onChange={(e) => setCompareText(e.target.value)} placeholder="Paste a teammate's build link" className="h-9 border-white/10 bg-black/30 text-sm" />
                    <button className={`${ghostBtn} px-3 py-1.5`} onClick={doCompare} disabled={!compareText.trim()}>
                      Overlay
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <CommunityMetaLoader
              className="rounded-3xl border-white/10 bg-white/[0.03] p-4 text-slate-200 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] backdrop-blur-xl sm:p-6"
              innerClassName="rounded-2xl border-white/10 bg-black/20"
              onLoad={(b) => {
                setBuild(withProfile(b));
                toast({ title: "Community build loaded", description: "Change anything you like, then copy the link." });
              }}
            />

            <Panel step="01" title="Pick your spot">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div className="mx-auto w-full max-w-[260px]">
                  <PitchPicker value={build.archetype} onChange={(k) => setBuild((b) => withProfile({ ...emptyBuild(k), name: b.name, level: b.level, skillMoves: b.skillMoves, weakFoot: b.weakFoot, masteryLevels: b.masteryLevels, boosts: { ...b.boosts } }))} />
                </div>
                <div className="flex flex-col justify-center gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: accent }}>
                    {arch.line === "FWD" ? "Forward" : arch.line === "MID" ? "Midfield" : arch.line === "DEF" ? "Defence" : "Goalkeeper"}
                  </div>
                  <div className="font-display text-4xl font-bold text-white">{arch.name}</div>
                  <p className="text-slate-400">{arch.blurb}</p>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-amber-300/80">Signature PlayStyles</div>
                      {rules.signatures.map((s, i) => (
                        <div key={s} className="text-amber-100">
                          ◆ {s} <span className="whitespace-nowrap text-xs text-amber-300/60">(+ at {SIGNATURE_PLUS_LEVELS[i]})</span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Level 45 Signature Perk</div>
                      <div className="text-white">{rules.perk45.name}</div>
                      <div className="text-xs text-slate-400">
                        When you {rules.perk45.trigger}: boosts {rules.perk45.boosts}.
                      </div>
                    </div>
                  </div>
                  {mastery && (
                    <p className="text-xs text-slate-500">
                      Mastery for levelling a {arch.name}: {masteryText(build.archetype, attrLabel)}.
                    </p>
                  )}
                  <div className="space-y-1.5 pt-1">
                    <label htmlFor="bp-name" className={label}>
                      Build name
                    </label>
                    <Input id="bp-name" value={build.name} maxLength={40} placeholder="e.g. Box-to-box engine" onChange={(e) => set({ name: e.target.value })} className="border-white/10 bg-black/30" />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel step="02" title="Level and body" aside={<UnitsToggle value={units} onChange={setUnits} />}>
              <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className={label}>Level</span>
                      <span className="font-display text-2xl font-bold tabular-nums text-white">
                        {build.level}
                        <span className="ml-2 text-sm font-normal text-slate-400">{summary.available} AP</span>
                      </span>
                    </div>
                    <Slider aria-label="Level" value={[build.level]} min={1} max={LEVEL_CAP} step={1} onValueChange={([n]) => set({ level: n })} />
                    <div className="relative mt-2 h-4">
                      {MILESTONES.map(([lvl, what]) => (
                        <button
                          key={lvl}
                          type="button"
                          title={`Level ${lvl}: ${what}`}
                          aria-label={`Go to level ${lvl}: ${what}`}
                          onClick={() => set({ level: lvl })}
                          className={`absolute -translate-x-1/2 text-[10px] font-bold tabular-nums transition ${build.level >= lvl ? "text-white" : "text-slate-600 hover:text-slate-300"}`}
                          style={{ left: `${((lvl - 1) / (LEVEL_CAP - 1)) * 100}%` }}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {(() => {
                        const next = MILESTONES.find(([l]) => l > build.level);
                        return next ? `Next: level ${next[0]}, ${next[1]}.` : "Level cap reached: everything is unlocked.";
                      })()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <div>
                      <div className={`mb-1 ${label}`}>Skill moves</div>
                      <Stars label="Skill moves" value={build.skillMoves} min={starRule(build.archetype, "skillMoves").start} max={starRule(build.archetype, "skillMoves").max} onChange={(v) => tryEdit(normaliseBuild({ ...build, skillMoves: v }), "That star")} />
                      <StarPrice archetype={build.archetype} kind="skillMoves" stars={build.skillMoves} />
                    </div>
                    <div>
                      <div className={`mb-1 ${label}`}>Weak foot</div>
                      <Stars label="Weak foot" value={build.weakFoot} min={starRule(build.archetype, "weakFoot").start} max={starRule(build.archetype, "weakFoot").max} onChange={(v) => tryEdit(normaliseBuild({ ...build, weakFoot: v }), "That star")} />
                      <StarPrice archetype={build.archetype} kind="weakFoot" stars={build.weakFoot} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Extra stars are bought with AP from the same budget as attributes{summary.starsAp ? ` (${summary.starsAp} AP on this build)` : ""}. Each archetype has its own starting stars and maximum.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <div className="mx-auto h-40 sm:h-56">
                    <BodyFigure heightCm={build.heightCm} weightKg={build.weightKg} color={accent} />
                  </div>
                  <div className="space-y-5">
                    {(
                      [
                        ["Height", build.heightCm, body.h, body.startH, formatHeight, (v: number) => set({ heightCm: v })],
                        ["Weight", build.weightKg, body.w, body.startW, formatWeight, (v: number) => set({ weightKg: v })],
                      ] as const
                    ).map(([name, v, range, start, fmt, onSet]) => (
                      <div key={name}>
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <span className={label}>
                            {name} <span className="normal-case tracking-normal text-slate-600">({fmt(range[0], units)} to {fmt(range[1], units)}, default {fmt(start, units)})</span>
                          </span>
                          <span className="whitespace-nowrap font-display text-2xl font-bold tabular-nums text-white">{fmt(v, units)}</span>
                        </div>
                        <Slider aria-label={name} value={[v]} min={range[0]} max={range[1]} step={1} onValueChange={([n]) => onSet(n)} />
                      </div>
                    ))}
                    <div>
                      <div className="mb-1.5 text-xs text-slate-400">In matches, your body changes:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(fx).length === 0 ? (
                          <span className="text-xs text-slate-500">Nothing at the default height and weight.</span>
                        ) : (
                          Object.entries(fx).map(([k, d]) => (
                            <span key={k} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${d! > 0 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300"}`}>
                              {attrLabel(k)} {d! > 0 ? `+${d}` : d}
                            </span>
                          ))
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Every {BODY_STEP.heightCm} cm (about {(BODY_STEP.heightCm / 2.54).toFixed(1)} in) or {BODY_STEP.weightKg} kg (about {Math.round(BODY_STEP.weightKg * 2.20462)} lb) from the default moves these by 1.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 lg:col-span-2 2xl:col-span-1">
                  <div className={label}>AcceleRATE</div>
                  <div className="mt-1 flex items-center gap-2 font-display text-3xl font-bold text-white">
                    <Zap className="h-6 w-6" style={{ color: accent }} /> {accel.type}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {accel.type === "Explosive"
                      ? "Quick off the mark, top speed comes a little later."
                      : accel.type === "Lengthy"
                        ? "Slower first steps, then long strides that hold top speed."
                        : "Even acceleration all the way to top speed."}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                    {(
                      [
                        ["Explosive needs", accel.explosive],
                        ["Lengthy needs", accel.lengthy],
                      ] as const
                    ).map(([title, checks]) => (
                      <div key={title}>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">{title}</div>
                        <ul className="space-y-0.5 text-xs">
                          {checks.map((c) => (
                            <li key={c.label} className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-slate-300">
                                {c.ok ? <Check className="h-3 w-3 text-emerald-400" /> : <X className="h-3 w-3 text-slate-600" />}
                                {c.label}
                              </span>
                              <span className={`tabular-nums ${c.ok ? "text-emerald-300" : "text-slate-500"}`}>
                                {c.label === "Height" ? `${units === "imperial" ? `${formatHeight(c.have, units)}, ` : ""}${c.have} cm / ${c.need}` : `${c.have} / ${c.need}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">Uses in-match values (body, masteries and facilities). Everything else is Controlled.</p>
                </div>
              </div>
            </Panel>

            <Panel
              step="03"
              title="Spend your AP"
              aside={
                <button className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white" onClick={() => set({ points: {} })}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              }
            >
              <div className="mb-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-3xl font-bold tabular-nums text-white">
                    {summary.spent}
                    <span className="ml-1 text-base font-normal text-slate-500">/ {summary.available} AP</span>
                  </span>
                  <span className={`font-display text-lg font-bold tabular-nums ${over ? "text-rose-400" : "text-slate-300"}`}>
                    {over ? `${-summary.remaining} over` : `${summary.remaining} left`}
                  </span>
                </div>
                <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="absolute inset-y-0 left-0 bg-white/[0.08]" style={{ width: `${availPct}%` }} />
                  <div className="absolute inset-y-0 left-0 flex" style={{ width: `${spentPct}%` }}>
                    {summary.focus.map((f) => (
                      <div key={f.group} style={{ width: `${f.share * 100}%`, background: GROUP_COLORS[f.group] }} className="h-full transition-all" />
                    ))}
                  </div>
                  <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${availPct}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                  <span>
                    {summary.levelNeeded
                      ? `This build needs level ${summary.levelNeeded}`
                      : summary.levelEstimate
                        ? `Needs about level ${summary.levelEstimate} (estimate)`
                        : `More than level ${LEVEL_CAP} gives`}
                  </span>
                  <span>Level {LEVEL_CAP}: {apAtLevel(LEVEL_CAP)} AP</span>
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-white/[0.07] pt-3">
                  <Switch checked={limit} onCheckedChange={setLimit} aria-label="Limit to my level" className="mt-0.5" />
                  <span className="text-xs text-slate-400">
                    <b className="block text-sm text-white">Limit to my level</b>
                    {limit
                      ? `On: you can't spend more than the ${summary.available} AP level ${build.level} gives. Turn it off to plan past your level.`
                      : over
                        ? summary.levelNeeded
                          ? `Off: this build is ${-summary.remaining} AP over level ${build.level}. You need level ${summary.levelNeeded} for these attributes.`
                          : summary.levelEstimate
                            ? `Off: this build needs ${summary.spent} AP, more than level ${LEVEL_CAP} (today's cap) gives. Estimate: about level ${summary.levelEstimate}, using ${ESTIMATE_SOURCE}'s AP for levels ${LEVEL_CAP + 1} and up until FC 27's are known.`
                            : `Off: this build is ${-summary.remaining} AP over level ${build.level}, more than any level we can estimate.`
                        : `Off: spend past level ${build.level} and this shows the level you'd need. Past level ${LEVEL_CAP} it is an estimate from ${ESTIMATE_SOURCE}'s levels.`}
                    {limitNote && <span className="mt-1 block text-amber-300">{limitNote}</span>}
                  </span>
                </label>
              </div>
              {summary.notes.length > 0 && (
                <div className="mb-5 space-y-1 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-sm text-amber-200">
                  {summary.notes.map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
              )}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <TierPips tier={1} /> cheapest
                </span>
                <span className="flex items-center gap-1.5">
                  <TierPips tier={4} /> dearest for a {arch.name}
                </span>
                <span>Grey = starting value · ◆ = in matches · red tick = cap</span>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {pointGroups.map((g) => {
                  const c = GROUP_COLORS[g.key as AttrGroup];
                  return (
                    <div key={g.key} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4" style={{ boxShadow: `inset 3px 0 0 ${c}` }}>
                      <div className="mb-3 flex items-baseline justify-between">
                        <h3 className="font-display text-lg font-bold uppercase tracking-wide" style={{ color: c }}>
                          {g.label}
                        </h3>
                        <span className="font-display text-xl font-bold tabular-nums text-white" title="Average in matches">
                          {Math.round(averages[g.key])}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {ATTRIBUTES.filter((a) => a.group === g.key && trainable(build.archetype, a.key)).map((a) => {
                          const start = startValue(build.archetype, a.key);
                          const v = trainedValue(build, a.key);
                          const cap = attrCap(build.archetype, a.key);
                          const shown = menuValue(build, a.key);
                          const match = matchValue(build, a.key, fx);
                          const next = v < cap ? pointCost(build.archetype, a.key, v + 1) : null;
                          const bonus = masteryBonus(build, a.key);
                          return (
                            <div key={a.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-sm sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto]">
                              <span className="flex min-w-0 items-center gap-2">
                                <TierPips tier={costTier(build.archetype, a.key)} />
                                <span className="leading-tight text-slate-300">{a.label}</span>
                              </span>
                              <div className="col-span-2 row-start-2 flex items-center gap-2 sm:col-span-1 sm:row-start-auto xl:col-span-2 xl:row-start-2">
                                <StatMeter start={start} value={v} cap={cap} match={match} color={c} label={a.label} onChange={(n) => setValue(a.key, n)} />
                              </div>
                              <div className="col-start-2 row-start-1 flex items-center gap-1 sm:col-start-auto sm:row-start-auto xl:col-start-2 xl:row-start-1">
                                <span className="min-w-[2rem] whitespace-nowrap text-right tabular-nums sm:w-16" title={`Starts at ${start}${bonus ? `, +${bonus} mastery` : ""}, ${match} in matches`}>
                                  <b className="text-white">{shown}</b>
                                  {match !== shown && <span className={`ml-1 text-[11px] ${match > shown ? "text-emerald-400" : "text-rose-400"}`}>◆{match}</span>}
                                </span>
                                <span className="w-11 whitespace-nowrap text-right text-[11px] tabular-nums text-slate-500" title="AP for the next point">
                                  {next === null ? "cap" : `${next} AP`}
                                </span>
                                <Nudge label={`Less ${a.label}`} disabled={v <= start} onClick={() => setValue(a.key, v - 1)}>
                                  <Minus className="h-3 w-3" />
                                </Nudge>
                                <Nudge label={`More ${a.label}`} disabled={v >= cap || (limit && next !== null && next > summary.remaining)} onClick={() => setValue(a.key, v + 1)}>
                                  <Plus className="h-3 w-3" />
                                </Nudge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Drag a bar or use the arrow keys (Shift for 5). A point costs more AP the higher it goes, and each archetype prices each attribute differently.
              </p>
            </Panel>

            <Panel step="04" title="Masteries and club facilities">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className={label}>Your level on each archetype</span>
                    {listLoaded && (
                      <span className="text-[11px] text-slate-500">
                        {mine.saveProfile.isPending
                          ? "Saving..."
                          : mine.saveProfile.isError
                            ? "Couldn't save, change one to try again"
                            : profile
                              ? "Saved to your account · used on every build"
                              : "Saved to your account when you change one"}
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-xs text-slate-400">
                    Masteries carry over: every archetype you've taken to level {MASTERY_LEVELS[0]} adds to its two attributes on all your builds{MASTERY_LEVELS.length > 1 ? `, then more at ${MASTERY_LEVELS.slice(1).join(" and ")}` : ""}. They show on your attributes but don't count towards PlayStyle or Specialization targets.
                    {mine.signedIn
                      ? " Enter them once: they're saved to your account and used on every build, here and on your Graphics Studio cards. Your saved builds' levels count by themselves."
                      : " Sign in to save them once for every build; your saved builds' levels then count by themselves."}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                    {ARCHETYPES.map((a) => {
                      const own = a.key === build.archetype;
                      const lvl = masteryLevelOf(build, a.key);
                      const pair = MASTERIES[a.key];
                      return (
                        <label key={a.key} className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${lvl >= 10 ? "border-white/15 bg-white/[0.04]" : "border-white/[0.06] bg-black/20"}`}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-white">{a.name}</span>
                            <span className="block truncate text-[11px] text-slate-500">{pair ? `${attrLabel(pair[0])}, ${attrLabel(pair[1])}` : ""}</span>
                          </span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={LEVEL_CAP}
                            aria-label={`${a.name} level`}
                            value={own ? Math.max(build.level, build.masteryLevels?.[a.key] ?? 0) : build.masteryLevels?.[a.key] ?? ""}
                            placeholder="0"
                            disabled={own}
                            title={own ? "This build's own level" : undefined}
                            onChange={(e) => setMastery(a.key, Number(e.target.value))}
                            className="h-8 w-16 border-white/10 bg-black/30 text-right tabular-nums"
                          />
                        </label>
                      );
                    })}
                  </div>
                  {masteryTotals.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {masteryTotals.map(([k, n]) => (
                        <span key={k} className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-sky-200">
                          {attrLabel(k)} +{n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className={`mb-2 flex items-center gap-2 ${label}`}>
                    <Building2 className="h-3.5 w-3.5" /> Club facility boosts
                  </div>
                  <p className="mb-3 text-xs text-slate-400">
                    Enter what your club's facilities add. They count in matches only, so they don't unlock PlayStyles or Specializations.
                    {mine.signedIn ? " Saved to your account and used on every build." : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Attribute to boost"
                      value={boostKey}
                      onChange={(e) => setBoostKey(e.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-sm text-slate-200"
                    >
                      <option value="">Pick an attribute</option>
                      {boostable.map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      max={BOOST_MAX}
                      aria-label="Boost amount"
                      value={boostAmt}
                      onChange={(e) => setBoostAmt(Math.max(1, Math.min(BOOST_MAX, Number(e.target.value) || 1)))}
                      className="h-9 w-16 border-white/10 bg-black/30 text-right tabular-nums"
                    />
                    <button
                      className={`${ghostBtn} h-9 px-3 py-1 text-xs`}
                      disabled={!boostKey}
                      onClick={() => {
                        setBoost(boostKey, boostAmt);
                        setBoostKey("");
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {boosts.length === 0 ? (
                      <span className="text-xs text-slate-500">No facility boosts yet.</span>
                    ) : (
                      boosts.map(([k, n]) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/10 py-0.5 pl-2.5 pr-1 text-xs font-semibold tabular-nums text-violet-200">
                          {attrLabel(k)} +{n}
                          <button aria-label={`Remove ${attrLabel(k)} boost`} onClick={() => setBoost(k, 0)} className="grid h-4 w-4 place-items-center rounded-full hover:bg-white/10">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">Up to +{BOOST_MAX} per attribute. EA doesn't publish FC 27's facility numbers, so copy them from your club's facilities screen.</p>
                </div>
              </div>
            </Panel>

            <Panel step="05" title="Specializations" aside={<span className="text-xs text-slate-500">one at a time</span>}>
              <p className="mb-4 text-sm text-slate-400">
                Get the first attribute to {SPECIALIZATION_TARGETS.main} and the others to {SPECIALIZATION_TARGETS.other} to unlock a Specialization. Its PlayStyle+ can take the place of either of your Signatures.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {specs.map((s) => {
                  const on = build.specialization === s.spec.key;
                  return (
                    <div key={s.spec.key} className="flex flex-col rounded-2xl border p-4 transition" style={on ? { borderColor: accent, background: `${accent}12`, boxShadow: `0 0 24px -10px ${accent}` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(0,0,0,.2)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-display text-lg font-bold text-white">{s.spec.name}</div>
                        {s.met ? <Check className="h-5 w-5 text-emerald-400" aria-label="Reached" /> : <Lock className="h-4 w-4 text-slate-500" aria-label="Not reached" />}
                      </div>
                      <div className="mb-3 text-xs text-amber-200">◆ {s.spec.plus}+</div>
                      <div className="mb-3 space-y-1.5">
                        {s.spec.req.map(([k, need]) => {
                          const have = unlockValue(build, k);
                          return (
                            <div key={k} className="text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-300">{attrLabel(k)}</span>
                                <span className={`tabular-nums ${have >= need ? "text-emerald-400" : "text-slate-400"}`}>
                                  {have}/{need}
                                </span>
                              </div>
                              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (have / need) * 100)}%`, background: have >= need ? "#34d399" : accent }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {s.spec.unconfirmed && <p className="mb-2 text-[11px] text-slate-500">{s.spec.unconfirmed}.</p>}
                      <div className="mt-auto flex flex-wrap gap-2">
                        {s.met ? (
                          <button className={`${ghostBtn} px-3 py-1.5 text-xs`} onClick={() => set({ specialization: on ? null : s.spec.key })} aria-pressed={on}>
                            {on ? "Active" : "Use this one"}
                          </button>
                        ) : s.apToReach === null ? (
                          <span className="text-xs text-slate-500">Out of reach for a {arch.name}.</span>
                        ) : (
                          <button className={`${ghostBtn} px-3 py-1.5 text-xs`} onClick={() => goForSpec(s.spec.key, s.spec.req)}>
                            <Target className="h-3.5 w-3.5" /> Go for it · {s.apToReach} AP
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel
              step="06"
              title="PlayStyles"
              aside={
                <span className="font-display text-lg font-bold tabular-nums text-slate-300" title={`Slots open at levels ${PLAYSTYLE_SLOT_LEVELS.join(", ")}`}>
                  {build.playstyles.length}/{summary.slots}
                </span>
              }
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {signatures.map((s) => (
                  <span key={s.def.name} className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-sm font-semibold text-amber-100" title={s.plus ? "PlayStyle+" : `Becomes PlayStyle+ at level ${SIGNATURE_PLUS_LEVELS[s.signature - 1]}`}>
                    ◆ {s.def.name}
                    {s.plus ? "+" : <span className="ml-1 text-xs font-normal text-amber-300/60">+ at {SIGNATURE_PLUS_LEVELS[s.signature - 1]}</span>}
                  </span>
                ))}
                {activeSpec?.met && (
                  <span className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-sm font-semibold text-amber-100">◆ {activeSpec.spec.plus}+ <span className="text-xs font-normal text-amber-300/60">Specialization, swaps in for a Signature</span></span>
                )}
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Signatures come free. You pick the rest: {summary.slots === 0 ? "your first slot opens at level 5" : `${summary.slots} slot${summary.slots === 1 ? "" : "s"} at level ${build.level}`}
                {nextSlot && summary.slots > 0 ? `, the next at level ${nextSlot}` : ""}. Each needs its attributes high enough.
              </p>
              <div className="space-y-4">
                {STYLE_GROUPS.filter((g) => g.key !== "goalkeeping" || keeper).map((g) => {
                  const list = styles.filter((s) => s.def.group === g.key && s.available && !s.signature);
                  if (!list.length) return null;
                  const c = STYLE_COLOR[g.key];
                  return (
                    <div key={g.key}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: c }}>
                        {g.label}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {list.map((s) => {
                          const on = build.playstyles.includes(s.def.name);
                          const full = !on && build.playstyles.length >= summary.slots;
                          const need = Object.entries(s.def.req)
                            .map(([k, n]) => `${attrLabel(k)} ${n}`)
                            .join(", ");
                          if (!s.unlocked)
                            return (
                              <button
                                key={s.def.name}
                                type="button"
                                disabled={s.apToUnlock === null}
                                onClick={() => unlockStyle(s.def.name, Object.entries(s.def.req) as [string, number][])}
                                title={`Needs ${need}${s.def.unconfirmed ? " (FC 26 values, not confirmed)" : ""}`}
                                className="group rounded-xl border border-dashed border-white/10 px-3 py-1.5 text-left text-sm text-slate-500 transition hover:border-white/30 hover:text-slate-200 disabled:opacity-40"
                              >
                                <span className="flex items-center gap-1.5">
                                  <Lock className="h-3 w-3" /> {s.def.name}
                                </span>
                                <span className="block text-[11px] tabular-nums">{s.apToUnlock === null ? "out of reach" : `unlock · ${s.apToUnlock} AP`}</span>
                              </button>
                            );
                          return (
                            <button
                              key={s.def.name}
                              type="button"
                              aria-pressed={on}
                              disabled={full}
                              onClick={() => toggleStyle(s.def.name)}
                              title={`Needs ${need}`}
                              className="rounded-xl border px-3 py-1.5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:opacity-30 disabled:hover:translate-y-0"
                              style={on ? { borderColor: c, background: `${c}22`, color: "#fff", boxShadow: `0 0 16px -4px ${c}` } : { borderColor: "rgba(255,255,255,.1)", color: "#cbd5e1" }}
                            >
                              {s.def.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Panel step="07" title="My builds">
                <MyBuildsPanel
                  build={build}
                  currentId={savedId}
                  units={units}
                  accent={accent}
                  onSaved={(id) => {
                    setSavedId(id);
                    toast({ title: "Build saved" });
                  }}
                  onOpen={(b, id) => {
                    setBuild(withProfile(b));
                    setSavedId(id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </Panel>
              <Panel step="08" title="Bring a build in">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={importText}
                    placeholder="Paste a GafferBot or Pro Clubs Builder link"
                    aria-label="Build link to import"
                    onChange={(e) => {
                      setImportText(e.target.value);
                      setImportNote(null);
                    }}
                    className="border-white/10 bg-black/30"
                  />
                  <button className={ghostBtn} onClick={doImport} disabled={!importText.trim()}>
                    <Import className="h-4 w-4" /> Import
                  </button>
                </div>
                {importNote && <p className="mt-2 text-xs text-slate-400">{importNote}</p>}
              </Panel>
            </div>

            <section className="rounded-3xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400 sm:p-6">
              <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
                <Info className="h-4 w-4" /> Where these numbers come from
              </h2>
              <p>
                EA doesn't publish AP prices, starting values or unlock thresholds. These are the {RULESET.game} Season {RULESET.season} numbers (from {RULESET.updated}, level cap {LEVEL_CAP}) measured by the Pro Clubs
                community and cross-checked: the prices reproduce every published worked example and all 39 Specialization costs. When EA changes them, the planner
                is updated in one place.
              </p>
              <p className="mt-2 text-slate-300">Not confirmed yet:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {UNCONFIRMED_NOTES.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>

            <p className="text-center text-xs text-slate-500">
              <Link to="/clubs" className="underline hover:text-white">
                Look up a club
              </Link>{" "}
              ·{" "}
              <Link to="/transfers" className="underline hover:text-white">
                Transfer board
              </Link>{" "}
              · Powered by{" "}
              <Link to="/welcome" className="underline hover:text-white">
                GafferBot
              </Link>
            </p>
          </main>
        </div>
      </div>

    </div>
  );
}
