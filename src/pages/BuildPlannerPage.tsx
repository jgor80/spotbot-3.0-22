import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Minus, Plus, Link2, ImageDown, Import, RotateCcw, GitCompareArrows, X, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  ARCHETYPES,
  ATTRIBUTES,
  HEIGHT_RANGE,
  LEVEL_MAX,
  MAX_PLAYSTYLES,
  PLAYSTYLES,
  POINTS_MAX_PER_ATTR,
  WEIGHT_RANGE,
  buildPath,
  buildSummary,
  decodeBuild,
  emptyBuild,
  encodeBuild,
  groupTotals,
  importProClubsBuilder,
  normaliseBuild,
  type Build,
} from "@/lib/proBuild";
import { CommunityMetaLoader } from "@/components/build/CommunityMetaBuilds";
import { BodyFigure, BuildCard, GROUP_COLORS, LINE_COLORS, Meter, PitchPicker, downloadCard, radarGroups, shapeValues } from "@/components/build/BuildVisuals";

// Accepts our links/codes and Pro Clubs Builder links
function readAnyBuild(text: string): { build: Build; skipped: string[] } | null {
  const ours = decodeBuild(text.trim().replace(/^.*[?&]b=/, "").replace(/[&#].*$/, ""));
  if (ours) return { build: ours, skipped: [] };
  return importProClubsBuilder(text);
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

function Stars({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${label} ${n}`}
          onClick={() => onChange(n)}
          className={`text-2xl leading-none transition-transform hover:scale-125 ${n <= value ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "text-white/15"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Nudge({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-slate-300 transition hover:border-white/30 hover:text-white disabled:opacity-25">
      {children}
    </button>
  );
}

const ghostBtn = "inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 disabled:opacity-40";

// gafferbot.app/build: plan a Virtual Pro, no sign-in. The whole build lives in the ?b= share code.
export default function BuildPlannerPage() {
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const [build, setBuild] = useState<Build>(() => decodeBuild(params.get("b") ?? "") ?? emptyBuild());
  const [importText, setImportText] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);
  const [compareText, setCompareText] = useState("");
  const [rival, setRival] = useState<Build | null>(null);
  const cardRef = useRef<SVGSVGElement>(null);

  // Keep the address bar in sync so a copied URL is always the current build
  useEffect(() => {
    const code = encodeBuild(build);
    if (params.get("b") !== code) setParams({ b: code }, { replace: true });
  }, [build, params, setParams]);

  const set = (patch: Partial<Build>) => setBuild((b) => normaliseBuild({ ...b, ...patch }));
  const setPoints = (key: string, v: number) => setBuild((b) => normaliseBuild({ ...b, points: { ...b.points, [key]: v } }));
  const summary = useMemo(() => buildSummary(build), [build]);
  const totals = useMemo(() => groupTotals(build), [build]);
  const rivalTotals = useMemo(() => (rival ? groupTotals(rival) : null), [rival]);
  const arch = ARCHETYPES.find((a) => a.key === build.archetype)!;
  const accent = LINE_COLORS[arch.line];
  const groups = radarGroups(build);
  const scaleMax = Math.max(1, ...groups.map((g) => totals[g.key]), ...(rivalTotals ? groups.map((g) => rivalTotals[g.key]) : []));
  const values = shapeValues(totals, groups, scaleMax);
  const ghost = rivalTotals ? shapeValues(rivalTotals, groups, scaleMax) : null;
  const pointGroups = groups.filter((g) => g.key !== "goalkeeping" || arch.line === "GK" || totals.goalkeeping > 0);
  const topGroups = summary.focus.slice(0, 2).map((f) => f.label);
  const budgetPct = build.budget ? Math.min(100, (summary.spent / build.budget) * 100) : 0;

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
    setBuild((b) => ({ ...r.build, playstyles: r.build.playstyles.length ? r.build.playstyles : b.playstyles, budget: r.build.budget ?? b.budget }));
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
      if (!has && b.playstyles.length >= MAX_PLAYSTYLES) return b;
      return normaliseBuild({ ...b, playstyles: has ? b.playstyles.filter((p) => p !== name) : [...b.playstyles, name] });
    });

  return (
    <div className="dark relative min-h-screen overflow-x-hidden bg-[#05080c] font-body text-slate-200">
      {/* Stage lighting: soft colour pools that follow the archetype's line, over a faint grid */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full opacity-25 blur-[120px] transition-colors duration-700" style={{ background: accent }} />
        <div className="absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-violet-500 opacity-[0.12] blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at top, black 30%, transparent 75%)" }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-8 sm:pt-12 lg:pb-16">
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
              Pick a spot on the pitch, shape the body, pour in your points and watch the build take form. Save it as a card for your club's Discord, or line it up
              against a teammate's build.
            </p>
          </div>
          <div className="hidden gap-2 lg:flex">
            <button className={ghostBtn} onClick={saveCard}>
              <ImageDown className="h-4 w-4" /> Save card
            </button>
            <button className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-[#05080c] shadow-[0_0_24px_-4px] transition hover:brightness-110" style={{ background: accent, boxShadow: `0 0 28px -6px ${accent}` }} onClick={share}>
              <Link2 className="h-4 w-4" /> Copy share link
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* The live card */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="mx-auto max-w-[380px] [perspective:1200px]">
              <div className="transition-transform duration-500 hover:[transform:rotateY(-6deg)_rotateX(4deg)]" style={{ filter: `drop-shadow(0 24px 48px ${accent}33)` }}>
                <BuildCard ref={cardRef} build={build} values={values} ghost={ghost} spent={summary.spent} remaining={summary.remaining} topGroups={topGroups} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
                <button className={ghostBtn} onClick={saveCard}>
                  <ImageDown className="h-4 w-4" /> Save card
                </button>
                <button className={ghostBtn} onClick={share}>
                  <Link2 className="h-4 w-4" /> Copy link
                </button>
              </div>
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
                        const d = totals[g.key] - (rivalTotals?.[g.key] ?? 0);
                        return (
                          <div key={g.key} className="flex justify-between">
                            <span style={{ color: GROUP_COLORS[g.key] }}>{g.label}</span>
                            <span className={d > 0 ? "text-emerald-400" : d < 0 ? "text-rose-400" : "text-slate-500"}>{d > 0 ? `+${d}` : d}</span>
                          </div>
                        );
                      })}
                    </div>
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
                setBuild((cur) => ({ ...b, budget: cur.budget }));
                toast({ title: "Community build loaded", description: "Change anything you like, then copy the link." });
              }}
            />
            <Panel step="01" title="Pick your spot">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div className="mx-auto w-full max-w-[260px]">
                  <PitchPicker value={build.archetype} onChange={(k) => set({ archetype: k })} />
                </div>
                <div className="flex flex-col justify-center gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: accent }}>
                    {arch.line === "FWD" ? "Forward" : arch.line === "MID" ? "Midfield" : arch.line === "DEF" ? "Defence" : "Goalkeeper"}
                  </div>
                  <div className="font-display text-4xl font-bold text-white">{arch.name}</div>
                  <p className="text-slate-400">{arch.blurb}</p>
                  <div className="flex flex-wrap gap-2">
                    {arch.focus.map((f) => (
                      <span key={f} className="rounded-full border px-3 py-1 text-xs font-semibold capitalize" style={{ borderColor: `${GROUP_COLORS[f]}66`, color: GROUP_COLORS[f], background: `${GROUP_COLORS[f]}14` }}>
                        Built around {f}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-1.5 pt-2">
                    <label htmlFor="bp-name" className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Build name
                    </label>
                    <Input id="bp-name" value={build.name} maxLength={40} placeholder="e.g. Box-to-box engine" onChange={(e) => set({ name: e.target.value })} className="border-white/10 bg-black/30" />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel step="02" title="Shape the body">
              <div className="grid gap-6 sm:grid-cols-[110px_minmax(0,1fr)]">
                <div className="mx-auto h-40 sm:h-auto">
                  <BodyFigure heightCm={build.heightCm} weightKg={build.weightKg} color={accent} />
                </div>
                <div className="space-y-5">
                  {(
                    [
                      ["Level", build.level, 1, LEVEL_MAX, "", (v: number) => set({ level: v })],
                      ["Height", build.heightCm, HEIGHT_RANGE[0], HEIGHT_RANGE[1], " cm", (v: number) => set({ heightCm: v })],
                      ["Weight", build.weightKg, WEIGHT_RANGE[0], WEIGHT_RANGE[1], " kg", (v: number) => set({ weightKg: v })],
                    ] as const
                  ).map(([label, v, min, max, unit, onSet]) => (
                    <div key={label}>
                      <div className="mb-2 flex items-baseline justify-between">
                        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</span>
                        <span className="font-display text-2xl font-bold tabular-nums text-white">
                          {v}
                          <span className="text-sm text-slate-500">{unit}</span>
                        </span>
                      </div>
                      <Slider aria-label={label} value={[v]} min={min} max={max} step={1} onValueChange={([n]) => onSet(n)} />
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-x-8 gap-y-3 pt-1">
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Skill moves</div>
                      <Stars label="Skill moves" value={build.skillMoves} onChange={(v) => set({ skillMoves: v })} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Weak foot</div>
                      <Stars label="Weak foot" value={build.weakFoot} onChange={(v) => set({ weakFoot: v })} />
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              step="03"
              title="Pour in points"
              aside={
                <button className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white" onClick={() => set({ points: {} })}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              }
            >
              <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="space-y-1">
                  <label htmlFor="budget" className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Points you have
                  </label>
                  <Input
                    id="budget"
                    className="h-9 w-28 border-white/10 bg-black/30"
                    type="number"
                    min={0}
                    placeholder="from game"
                    value={build.budget ?? ""}
                    onChange={(e) => set({ budget: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-3xl font-bold tabular-nums text-white">
                      {summary.spent}
                      <span className="ml-1 text-sm font-normal text-slate-500">spent</span>
                    </span>
                    {summary.remaining !== null && (
                      <span className={`font-display text-lg font-bold tabular-nums ${summary.remaining < 0 ? "text-rose-400" : "text-slate-300"}`}>
                        {summary.remaining < 0 ? `${-summary.remaining} over` : `${summary.remaining} left`}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    {build.budget
                      ? summary.focus.map((f) => <div key={f.group} style={{ width: `${f.share * budgetPct}%`, background: GROUP_COLORS[f.group] }} className="h-full transition-all" />)
                      : summary.focus.map((f) => <div key={f.group} style={{ width: `${f.share * 100}%`, background: GROUP_COLORS[f.group] }} className="h-full transition-all" />)}
                  </div>
                </div>
              </div>
              {summary.notes.length > 0 && (
                <div className="mb-5 space-y-1 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-sm text-amber-200">
                  {summary.notes.map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
              )}
              <div className="grid gap-4">
                {pointGroups.map((g) => {
                  const c = GROUP_COLORS[g.key];
                  return (
                    <div key={g.key} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4" style={{ boxShadow: totals[g.key] ? `inset 3px 0 0 ${c}` : undefined }}>
                      <div className="mb-3 flex items-baseline justify-between">
                        <h3 className="font-display text-lg font-bold uppercase tracking-wide" style={{ color: c }}>
                          {g.label}
                        </h3>
                        <span className="font-display text-xl font-bold tabular-nums text-white">{totals[g.key]}</span>
                      </div>
                      <div className="space-y-2.5">
                        {ATTRIBUTES.filter((a) => a.group === g.key).map((a) => {
                          const v = build.points[a.key] ?? 0;
                          return (
                            <div key={a.key} className="flex items-center gap-2 text-sm">
                              <span className="w-24 shrink-0 truncate text-slate-300 sm:w-36">{a.label}</span>
                              <Meter value={v} color={c} label={a.label} onChange={(n) => setPoints(a.key, n)} />
                              <span className="w-6 text-right font-semibold tabular-nums text-white">{v}</span>
                              <Nudge label={`Less ${a.label}`} disabled={v <= 0} onClick={() => setPoints(a.key, v - 1)}>
                                <Minus className="h-3 w-3" />
                              </Nudge>
                              <Nudge label={`More ${a.label}`} disabled={v >= POINTS_MAX_PER_ATTR} onClick={() => setPoints(a.key, v + 1)}>
                                <Plus className="h-3 w-3" />
                              </Nudge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">Drag a bar or use the arrow keys (hold Shift for 5 at a time).</p>
            </Panel>

            <Panel step="04" title="PlayStyles" aside={<span className="font-display text-lg font-bold tabular-nums text-slate-300">{build.playstyles.length}/{MAX_PLAYSTYLES}</span>}>
              <div className="space-y-4">
                {groups.map((g) => {
                  const styles = PLAYSTYLES.filter((p) => p.group === g.key);
                  if (!styles.length) return null;
                  const c = GROUP_COLORS[g.key];
                  return (
                    <div key={g.key}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: c }}>
                        {g.label}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {styles.map((p) => {
                          const on = build.playstyles.includes(p.name);
                          const full = !on && build.playstyles.length >= MAX_PLAYSTYLES;
                          return (
                            <button
                              key={p.name}
                              type="button"
                              aria-pressed={on}
                              disabled={full}
                              onClick={() => toggleStyle(p.name)}
                              className="rounded-xl border px-3 py-1.5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:opacity-30 disabled:hover:translate-y-0"
                              style={on ? { borderColor: c, background: `${c}22`, color: "#fff", boxShadow: `0 0 16px -4px ${c}` } : { borderColor: "rgba(255,255,255,.1)", color: "#cbd5e1" }}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel step="05" title="Bring a build in">
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

            <p className="text-xs text-slate-500">
              EA doesn't publish FC 27's point costs, caps or PlayStyle unlock rules, so the planner doesn't guess them: what you have to spend comes from your own
              game screen.
            </p>
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

      {/* Phone: points and share always in reach */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#05080c]/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold uppercase tracking-wide" style={{ color: accent }}>
              {arch.name}
              {build.name ? <span className="text-slate-400"> · {build.name}</span> : null}
            </div>
            <div className="text-sm tabular-nums text-slate-300">
              <b className="text-white">{summary.spent}</b> spent
              {summary.remaining !== null && <span className={summary.remaining < 0 ? "text-rose-400" : ""}> · {summary.remaining < 0 ? `${-summary.remaining} over` : `${summary.remaining} left`}</span>}
            </div>
          </div>
          <button className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[#05080c]" style={{ background: accent }} onClick={share}>
            <Link2 className="h-4 w-4" /> Share
          </button>
        </div>
      </div>
    </div>
  );
}
