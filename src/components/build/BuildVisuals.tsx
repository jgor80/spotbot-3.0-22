// Visual pieces for the Virtual Pro build planner: the pitch you pick an archetype on, the live shape
// radar, the shareable build card (one SVG, shown on the page and saved as a PNG as-is), attribute
// meters you can drag, and the body silhouette.
import { forwardRef, useCallback, useRef } from "react";
import { ARCHETYPES, ATTR_GROUPS, MAX_PLAYSTYLES, POINTS_MAX_PER_ATTR, type AttrGroup, type Build } from "@/lib/proBuild";

export const GROUP_COLORS: Record<AttrGroup, string> = {
  pace: "#22d3ee",
  shooting: "#fb7185",
  passing: "#fbbf24",
  dribbling: "#a78bfa",
  defending: "#34d399",
  physical: "#fb923c",
  goalkeeping: "#60a5fa",
};

export const LINE_COLORS = { GK: "#60a5fa", DEF: "#34d399", MID: "#fbbf24", FWD: "#fb7185" } as const;

// Where each archetype sits on a vertical pitch (attacking upwards), viewBox 0 0 100 150
const SPOTS: Record<string, [number, number]> = {
  shotstopper: [30, 136],
  sweeperkeeper: [70, 136],
  boss: [50, 114],
  progressor: [27, 110],
  marauder: [79, 104],
  disruptor: [30, 86],
  recycler: [52, 90],
  maestro: [72, 82],
  creator: [50, 64],
  magician: [24, 46],
  spark: [80, 42],
  target: [62, 26],
  finisher: [40, 22],
};

export function PitchPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <svg viewBox="0 0 100 150" className="h-auto w-full select-none" role="radiogroup" aria-label="Archetype">
      <defs>
        <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b2a1c" />
          <stop offset="1" stopColor="#06170f" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width="100" height="150" rx="6" fill="url(#turf)" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x="3" y={3 + i * 14.4} width="94" height="7.2" fill="#ffffff" opacity="0.025" />
      ))}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="0.5">
        <rect x="3" y="3" width="94" height="144" rx="1" />
        <line x1="3" y1="75" x2="97" y2="75" />
        <circle cx="50" cy="75" r="11" />
        <rect x="24" y="3" width="52" height="20" />
        <rect x="38" y="3" width="24" height="7" />
        <rect x="24" y="127" width="52" height="20" />
        <rect x="38" y="140" width="24" height="7" />
        <path d="M41 23 A10 10 0 0 0 59 23" />
        <path d="M41 127 A10 10 0 0 1 59 127" />
      </g>
      {ARCHETYPES.map((a) => {
        const [x, y] = SPOTS[a.key] ?? [50, 75];
        const on = a.key === value;
        const c = LINE_COLORS[a.line];
        return (
          <g
            key={a.key}
            role="radio"
            aria-checked={on}
            aria-label={a.name}
            tabIndex={0}
            className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-white"
            onClick={() => onChange(a.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(a.key);
              }
            }}
          >
            {on && <circle cx={x} cy={y} r="7.5" fill={c} opacity="0.25" className="animate-pulse" />}
            <circle cx={x} cy={y} r={on ? 4.6 : 3.4} fill={on ? c : "#0b1510"} stroke={c} strokeWidth={on ? 1.2 : 0.8} filter={on ? "url(#glow)" : undefined} style={{ transition: "r .2s" }} />
            <text x={x} y={y + (on ? 10.5 : 9)} textAnchor="middle" fontSize={on ? 4.4 : 3.6} fontWeight={on ? 700 : 500} fill={on ? "#ffffff" : "#cbd5e1"} style={{ fontFamily: "Rajdhani, sans-serif", letterSpacing: 0.2 }}>
              {a.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Radar points for a set of 0..1 values around a circle
const radarPoints = (vals: number[], cx: number, cy: number, r: number) =>
  vals.map((v, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / vals.length;
    const rr = r * Math.max(0.04, Math.min(1, v));
    return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)] as const;
  });

export function radarGroups(b: Build) {
  const arch = ARCHETYPES.find((a) => a.key === b.archetype)!;
  return ATTR_GROUPS.filter((g) => (arch.line === "GK" ? true : g.key !== "goalkeeping"));
}

export function RadarShape({
  cx,
  cy,
  r,
  groups,
  values,
  ghost,
  accent,
  labels = true,
  idPrefix,
}: {
  cx: number;
  cy: number;
  r: number;
  groups: { key: AttrGroup; label: string }[];
  values: number[];
  ghost?: number[] | null;
  accent: string;
  labels?: boolean;
  idPrefix: string;
}) {
  const ring = (f: number) => radarPoints(groups.map(() => f), cx, cy, r).map((p) => p.join(",")).join(" ");
  const pts = radarPoints(values, cx, cy, r);
  const ghostPts = ghost ? radarPoints(ghost, cx, cy, r) : null;
  return (
    <g>
      <defs>
        <radialGradient id={`${idPrefix}-fill`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={accent} stopOpacity="0.15" />
          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
        </radialGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke="#ffffff" strokeOpacity={f === 1 ? 0.25 : 0.1} strokeWidth="1" />
      ))}
      {radarPoints(groups.map(() => 1), cx, cy, r).map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#ffffff" strokeOpacity="0.08" />
      ))}
      {ghostPts && <polygon points={ghostPts.map((p) => p.join(",")).join(" ")} fill="#ffffff" fillOpacity="0.06" stroke="#ffffff" strokeOpacity="0.7" strokeDasharray="4 3" strokeWidth="1.5" />}
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={`url(#${idPrefix}-fill)`} stroke={accent} strokeWidth="2.2" strokeLinejoin="round" style={{ transition: "all .35s cubic-bezier(.2,.8,.2,1)" }} />
      {pts.map(([x, y], i) => (
        <circle key={groups[i].key} cx={x} cy={y} r="3.4" fill={GROUP_COLORS[groups[i].key]} stroke="#05080c" strokeWidth="1.2" />
      ))}
      {labels &&
        radarPoints(groups.map(() => 1.12), cx, cy, r).map(([x, y], i) => (
          <text key={groups[i].key} x={x + (x < cx - 5 ? -5 : x > cx + 5 ? 5 : 0)} y={y + (y < cy - r * 0.9 ? -2 : y > cy + r * 0.9 ? 12 : 4)} textAnchor={x < cx - 5 ? "end" : x > cx + 5 ? "start" : "middle"} fontSize="11" fontWeight="700" fill={GROUP_COLORS[groups[i].key]} style={{ fontFamily: "Rajdhani, sans-serif", letterSpacing: 0.6 }}>
            {groups[i].label.slice(0, 3).toUpperCase()}
          </text>
        ))}
    </g>
  );
}

// Shape values: each group's points against the build's own biggest group, so the outline shows where
// the build leans whatever the total. With a comparison, both share one scale.
export function shapeValues(totals: Record<AttrGroup, number>, groups: { key: AttrGroup }[], scaleMax: number) {
  return groups.map((g) => (scaleMax ? totals[g.key] / scaleMax : 0));
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export const BuildCard = forwardRef<
  SVGSVGElement,
  { build: Build; values: number[]; ghost?: number[] | null; spent: number; remaining: number | null; topGroups: string[] }
>(function BuildCard({ build, values, ghost, spent, remaining, topGroups }, ref) {
  const arch = ARCHETYPES.find((a) => a.key === build.archetype)!;
  const accent = LINE_COLORS[arch.line];
  const groups = radarGroups(build);
  const W = 360;
  const H = 560;
  const styles = build.playstyles.slice(0, MAX_PLAYSTYLES);
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${arch.name} build card`}>
      <defs>
        <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d1620" />
          <stop offset="0.55" stopColor="#070b11" />
          <stop offset="1" stopColor="#0d1620" />
        </linearGradient>
        <linearGradient id="card-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={accent} />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="1" stopColor={accent} />
        </linearGradient>
        <radialGradient id="card-glow" cx="50%" cy="38%" r="55%">
          <stop offset="0" stopColor={accent} stopOpacity="0.28" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <pattern id="card-hex" width="14" height="24" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
          <path d="M7 0 L14 4 L14 12 L7 16 L0 12 L0 4 Z M7 16 L7 24" fill="none" stroke="#ffffff" strokeOpacity="0.035" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="22" fill="url(#card-bg)" stroke="url(#card-edge)" strokeWidth="3" />
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="20" fill="url(#card-hex)" />
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="20" fill="url(#card-glow)" />

      <g style={{ fontFamily: "Rajdhani, 'Exo 2', Arial, sans-serif" }}>
        <text x="26" y="44" fontSize="12" fontWeight="700" letterSpacing="2.5" fill={accent}>
          {arch.line === "FWD" ? "FORWARD" : arch.line === "MID" ? "MIDFIELD" : arch.line === "DEF" ? "DEFENCE" : "GOALKEEPER"}
        </text>
        <text x="26" y="78" fontSize="34" fontWeight="700" fill="#ffffff">
          {arch.name.toUpperCase()}
        </text>
        <text x="26" y="100" fontSize="15" fill="#cbd5e1">
          {(build.name || "Untitled build").slice(0, 34)}
        </text>
        <g transform={`translate(${W - 76} 26)`}>
          <rect width="50" height="58" rx="12" fill="#ffffff" fillOpacity="0.06" stroke={accent} strokeOpacity="0.6" />
          <text x="25" y="20" textAnchor="middle" fontSize="10" letterSpacing="1.5" fill="#94a3b8">
            LVL
          </text>
          <text x="25" y="46" textAnchor="middle" fontSize="26" fontWeight="700" fill="#ffffff">
            {build.level}
          </text>
        </g>

        <RadarShape idPrefix="card" cx={W / 2} cy={236} r={88} groups={groups} values={values} ghost={ghost} accent={accent} />

        <g transform="translate(26 368)" fontSize="13" fill="#e2e8f0">
          <text>
            <tspan fill="#94a3b8">HT </tspan>
            {build.heightCm} cm
            <tspan fill="#94a3b8" dx="14">WT </tspan>
            {build.weightKg} kg
          </text>
          <text x={W - 52} textAnchor="end">
            <tspan fill="#94a3b8">SM </tspan>
            <tspan fill="#fbbf24">{stars(build.skillMoves)}</tspan>
          </text>
          <text y="22">
            <tspan fill="#94a3b8">POINTS </tspan>
            {spent}
            {remaining !== null && <tspan fill={remaining < 0 ? "#f87171" : "#94a3b8"}>{remaining < 0 ? `  (${-remaining} over)` : `  (${remaining} left)`}</tspan>}
          </text>
          <text x={W - 52} y="22" textAnchor="end">
            <tspan fill="#94a3b8">WF </tspan>
            <tspan fill="#fbbf24">{stars(build.weakFoot)}</tspan>
          </text>
          {topGroups.length > 0 && (
            <text y="44" fill="#94a3b8">
              Built for <tspan fill="#ffffff">{topGroups.join(" + ").toLowerCase()}</tspan>
            </text>
          )}
        </g>

        <line x1="26" y1="428" x2={W - 26} y2="428" stroke="#ffffff" strokeOpacity="0.1" />
        <text x="26" y="448" fontSize="10" letterSpacing="2" fill="#94a3b8">
          PLAYSTYLES {styles.length ? `· ${styles.length}` : ""}
        </text>
        {styles.length === 0 && (
          <text x="26" y="470" fontSize="13" fill="#64748b">
            None picked yet
          </text>
        )}
        {styles.map((s, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          return (
            <g key={s} transform={`translate(${26 + col * 156} ${472 + row * 15})`}>
              <circle cx="3" cy="-3.5" r="2.5" fill={accent} />
              <text x="10" fontSize="12" fill="#e2e8f0">
                {s}
              </text>
            </g>
          );
        })}
        <text x={W / 2} y={H - 14} textAnchor="middle" fontSize="10" letterSpacing="2" fill="#475569">
          GAFFERBOT.APP/BUILD
        </text>
      </g>
    </svg>
  );
});

// Most builds put well under 30 into one attribute, so the bar spans 0-30 to stay readable; the
// +/- buttons and arrow keys still go up to the cap.
export const METER_MAX = 30;

// Draggable meter for one attribute. Click or drag anywhere on the track; arrow keys work too.
export function Meter({ value, onChange, color, label }: { value: number; onChange: (v: number) => void; color: string; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const setFrom = useCallback(
    (clientX: number) => {
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      onChange(Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * METER_MAX));
    },
    [onChange]
  );
  const pct = Math.min(100, (value / METER_MAX) * 100);
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={POINTS_MAX_PER_ATTR}
      aria-valuenow={value}
      className="relative h-3 flex-1 cursor-pointer touch-none rounded-full bg-white/[0.06] outline-none ring-offset-2 ring-offset-[#070b11] focus-visible:ring-2"
      style={{ ["--tw-ring-color" as string]: color }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setFrom(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && setFrom(e.clientX)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 5 : 1;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(POINTS_MAX_PER_ATTR, value + step));
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(0, value - step));
        }
        if (e.key === "Home") onChange(0);
      }}
    >
      {[0.25, 0.5, 0.75].map((t) => (
        <span key={t} className="absolute top-0 h-full w-px bg-white/10" style={{ left: `${t * 100}%` }} />
      ))}
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}55, ${color})`, boxShadow: value ? `0 0 12px ${color}88` : undefined }}
      />
      {value > 0 && <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#070b11]" style={{ left: `${pct}%`, background: color }} />}
    </div>
  );
}

// A simple figure that grows with height and fills out with weight
export function BodyFigure({ heightCm, weightKg, color }: { heightCm: number; weightKg: number; color: string }) {
  const h = 60 + ((heightCm - 150) / 60) * 60; // 60..120
  const bmi = weightKg / (heightCm / 100) ** 2;
  const w = 0.75 + Math.max(0, Math.min(1, (bmi - 17) / 15)) * 0.6; // width factor
  const top = 130 - h;
  const head = h * 0.13;
  return (
    <svg viewBox="0 0 80 134" className="h-full w-auto" aria-hidden>
      {[150, 170, 190, 210].map((cm) => {
        const y = 130 - (60 + ((cm - 150) / 60) * 60);
        return (
          <g key={cm}>
            <line x1="0" x2="80" y1={y} y2={y} stroke="#ffffff" strokeOpacity="0.07" strokeDasharray="2 3" />
            <text x="1" y={y - 2} fontSize="6" fill="#64748b">
              {cm}
            </text>
          </g>
        );
      })}
      <g transform={`translate(40 ${top})`} fill={color} style={{ transition: "all .3s" }}>
        <circle cx="0" cy={head} r={head} opacity="0.95" />
        <rect x={-10 * w} y={head * 2 + 2} width={20 * w} height={h * 0.38} rx={6 * w} />
        <rect x={-15 * w} y={head * 2 + 4} width={5 * w} height={h * 0.32} rx="2.5" opacity="0.8" />
        <rect x={10 * w} y={head * 2 + 4} width={5 * w} height={h * 0.32} rx="2.5" opacity="0.8" />
        <rect x={-8 * w} y={head * 2 + 2 + h * 0.38 - 2} width={7 * w} height={h * 0.47} rx="3" />
        <rect x={1 * w} y={head * 2 + 2 + h * 0.38 - 2} width={7 * w} height={h * 0.47} rx="3" />
      </g>
      <line x1="0" x2="80" y1="130.5" y2="130.5" stroke="#ffffff" strokeOpacity="0.2" />
    </svg>
  );
}

// Save the build card as a PNG (2x), using the same SVG that's on screen
export async function downloadCard(svg: SVGSVGElement, fileName: string) {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const vb = svg.viewBox.baseVal;
  const canvas = document.createElement("canvas");
  canvas.width = vb.width * 2;
  canvas.height = vb.height * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Couldn't make the image");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
