// Evolutions finder (Jeff, 2026-11-10): which of the user's club cards can enter each live evolution, what they become
// after every level, and how much each one would improve their latest squad. Read-only: it never starts or pays for
// an evolution; the user does that in EA's app.
//
// Evolutions come from the XI Lab helper (v0.10.0+: the Web App's `academy` answers, account_state.evolutions; EA's
// FC 27 field names UNVERIFIED, so `fromEa` maps the names community clients used and lists the rest as unread) or
// from text the user pastes (FUT.GG / FUTBIN / EA wording). The new overall is EA's "+N OVR" upgrades added up, not
// a rating formula, so it's an estimate.

export type Face = "pac" | "sho" | "pas" | "dri" | "def" | "phy";
export type NumField = "overall" | Face | "skill_moves" | "weak_foot" | "playstyles" | "playstyles_plus";
export type Op = "min" | "max" | "exact";

export type EvoRule =
  | { field: NumField; op: Op; value: number }
  | { field: "position" | "league" | "nation" | "club" | "rarity"; op: "in" | "not_in"; values: string[] };

export type EvoUpgrade =
  | { field: "overall" | Face | "skill_moves" | "weak_foot"; add: number }
  | { field: "playstyle"; name: string; plus: boolean }
  | { field: "position"; name: string };

export interface Evolution {
  id: string;
  name: string;
  description: string | null;
  end_at: string | null;
  coins: number | null;
  points: number | null;
  rules: EvoRule[];
  levels: EvoUpgrade[][];
  unread: string[];
  source: "helper" | "pasted";
}

export interface EvoCard {
  id: string;
  name: string;
  version: string | null;
  overall: number;
  positions: string[];
  league: string | null;
  nation: string | null;
  club: string | null;
  is_icon?: boolean;
  is_hero?: boolean;
  stats: Partial<Record<Face, number>>;
  skill_moves: number | null;
  weak_foot: number | null;
  playstyles: string[];
  playstyles_plus: string[];
  ea_item_id?: number | null;
  untradeable?: boolean;
}

const FACE: Face[] = ["pac", "sho", "pas", "dri", "def", "phy"];
const STAT_WORDS: [RegExp, "overall" | Face | "skill_moves" | "weak_foot" | "playstyles" | "playstyles_plus"][] = [
  [/^(ovr|overall|rating|player ?rating)$/i, "overall"],
  [/^(pac|pace)$/i, "pac"], [/^(sho|shooting)$/i, "sho"], [/^(pas|passing)$/i, "pas"], [/^(dri|dribbling)$/i, "dri"],
  [/^(def|defending|defence|defense)$/i, "def"], [/^(phy|physical|physicality)$/i, "phy"],
  [/^skill ?moves?$|^sm$/i, "skill_moves"], [/^weak ?foot$|^wf$/i, "weak_foot"],
  [/^playstyles? ?(\+|plus)$|^playstyles?_plus$/i, "playstyles_plus"], [/^playstyles?$/i, "playstyles"],
];
const statOf = (word: string) => STAT_WORDS.find(([re]) => re.test(word.trim()))?.[1] ?? null;
const POSITION = /^(GK|LB|LWB|CB|RB|RWB|CDM|CM|CAM|LM|RM|LW|RW|CF|ST)$/;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const opOf = (s: string): Op => (/\bmax(imum)?\.?\b|or (less|lower|fewer)|at most|\bunder\b/i.test(s) ? "max" : /\bexactly\b/i.test(s) ? "exact" : "min");

// ------------------------------------------------------------------ pasted text

/** One requirement line ("Overall: Max 82", "Position: CM, CDM", "PlayStyles+: Max 1") → a rule, or null. */
export function parseRuleLine(raw: string): EvoRule | null {
  const line = raw.replace(/^[•·*\-–]\s*/, "").replace(/\s+/g, " ").trim();
  const colon = line.indexOf(":");
  let label = colon > 0 ? line.slice(0, colon) : line.replace(/\s*(min(imum)?\.?|max(imum)?\.?|exactly|\d).*$/i, "");
  const rest = colon > 0 ? line.slice(colon + 1).trim() : line.slice(label.length).trim();
  // "Max. 82 OVR" / "Max OVR 82": the stat comes after the operator.
  const lead = /^(min(imum)?\.?|max(imum)?\.?|exactly)\s+(\d+)\s+([A-Za-z +]+)$/i.exec(line) ?? /^(min(imum)?\.?|max(imum)?\.?|exactly)\s+([A-Za-z +]+?)\s+(\d+)$/i.exec(line);
  if (lead) {
    const num = Number(lead[4] && /^\d+$/.test(lead[4]) ? lead[4] : lead[5]);
    const word = /^\d+$/.test(lead[4] ?? "") ? lead[5]! : lead[4]!;
    const f = statOf(word);
    return f && Number.isFinite(num) ? { field: f, op: opOf(lead[1]!), value: num } : null;
  }
  label = label.trim();
  const f = statOf(label);
  const n = /(\d+)/.exec(rest)?.[1];
  if (f && n) return { field: f, op: opOf(rest), value: Number(n) };
  const values = rest.split(/\s*(?:,|\bor\b|\/|\|)\s*/i).map((s) => s.trim()).filter(Boolean).slice(0, 15);
  const not = /\bnot\b|\bexcept\b|\bexclud/i.test(label + " " + rest);
  const clean = values.map((v) => v.replace(/^(not|except)\s+/i, ""));
  if (/^(positions?|preferred positions?)$/i.test(label)) {
    const pos = clean.map((v) => v.toUpperCase()).filter((v) => POSITION.test(v));
    return pos.length ? { field: "position", op: not ? "not_in" : "in", values: pos } : null;
  }
  if (/^(league|nation|country\/region|nationality|club|rarity|card type)s?$/i.test(label) && clean.length) {
    const field = /^league/i.test(label) ? "league" : /^(nation|country|nationality)/i.test(label) ? "nation" : /^club/i.test(label) ? "club" : "rarity";
    return { field, op: not ? "not_in" : "in", values: clean };
  }
  return null;
}

/** One upgrade line ("+3 OVR", "Pace +5", "PlayStyle+: Finesse Shot", "Position: CAM") → upgrades. */
export function parseUpgradeLine(raw: string): EvoUpgrade[] {
  const line = raw.replace(/^[•·*\-–]\s*/, "").replace(/\s+/g, " ").trim();
  const out: EvoUpgrade[] = [];
  const ps = /^(new )?playstyles?\s*(\+|plus)?\s*:?\s*(.+)$/i.exec(line);
  if (ps) {
    for (const name of ps[3]!.split(/\s*(?:,|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean).slice(0, 6)) out.push({ field: "playstyle", name: name.slice(0, 40), plus: !!ps[2] });
    return out;
  }
  const pos = /^(new |added |alt(ernative)? )?positions?\s*:?\s*(.+)$/i.exec(line);
  if (pos) {
    for (const p of pos[3]!.split(/\s*(?:,|\/|\band\b)\s*/i).map((s) => s.trim().toUpperCase()).filter((p) => POSITION.test(p))) out.push({ field: "position", name: p });
    return out;
  }
  // "+3 OVR", "OVR +3", "Pace: +5", "Shooting +2, Passing +3"
  for (const part of line.split(/\s*,\s*/)) {
    const a = /^\+?\s*(\d+)\s+([A-Za-z ]+)$/.exec(part) ?? null;
    const b = /^([A-Za-z ]+?)\s*:?\s*\+\s*(\d+)$/.exec(part) ?? null;
    const word = a ? a[2]! : b ? b[1]! : null, num = a ? Number(a[1]) : b ? Number(b[2]) : NaN;
    const f = word ? statOf(word) : null;
    if (f && f !== "playstyles" && f !== "playstyles_plus" && num > 0 && num <= 30) out.push({ field: f, add: num });
  }
  return out;
}

/** Pasted evolution: requirement lines, and upgrade lines split into levels by "Level N" headings (else one level). */
export function parseEvolutionText(name: string, rulesText: string, upgradesText: string): Evolution {
  const rules: EvoRule[] = [], unread: string[] = [];
  for (const l of rulesText.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 30)) {
    const r = parseRuleLine(l);
    if (r) rules.push(r); else unread.push(l.slice(0, 160));
  }
  const levels: EvoUpgrade[][] = [];
  let cur: EvoUpgrade[] = [];
  for (const l of upgradesText.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 60)) {
    if (/^(level|stage|step|tier)\s*\d+\s*:?$/i.test(l)) { if (cur.length) levels.push(cur); cur = []; continue; }
    const ups = parseUpgradeLine(l.replace(/^(level|stage)\s*\d+\s*:\s*/i, ""));
    if (ups.length) cur.push(...ups); else unread.push(l.slice(0, 160));
  }
  if (cur.length) levels.push(cur);
  return { id: `pasted:${norm(name).slice(0, 40) || "evolution"}`, name: name.trim().slice(0, 120) || "My evolution", description: null, end_at: null, coins: null, points: null, rules, levels, unread, source: "pasted" };
}

// ------------------------------------------------------------------ EA's own answers (helper capture)

export interface EaEntry { type: string; values: (number | string)[]; scope: string | null }
export interface EaEvolution { evo_id: number; name: string; description: string | null; end_at: string | null; coins: number | null; points: number | null; status: string | null; requirements: EaEntry[]; levels: { upgrades: EaEntry[] }[] }

const eaWord = (t: string) => t.toUpperCase().replace(/^(PLAYER|ATTRIBUTE|ATTR|STAT|ELIGIBILITY)_/, "").replace(/_(MIN|MAX|VALUE)$/, "");
const eaOp = (scope: string | null, type: string): Op => (scope === "LOWER" || /_MAX$|^MAX_/.test(type) ? "max" : scope === "EXACT" ? "exact" : "min");

/** EA names are mapped where community clients knew them (UNVERIFIED on FC 27); everything else is listed as unread. */
export function fromEa(e: EaEvolution, names: { leagues: Map<number, string>; nations: Map<number, string>; clubs: Map<number, string> }): Evolution {
  const unread: string[] = [];
  const rules: EvoRule[] = [];
  const show = (x: EaEntry) => [x.type, x.scope, x.values.join(",")].filter(Boolean).join(" ");
  for (const r of e.requirements) {
    const w = eaWord(r.type), f = statOf(w.replace(/_/g, " "));
    const nums = r.values.filter((v): v is number => typeof v === "number"), strs = r.values.filter((v): v is string => typeof v === "string");
    if (f && nums.length) { rules.push({ field: f, op: eaOp(r.scope, r.type), value: nums[0]! }); continue; }
    if (/^(POSITION|PREFERRED_POSITION|POSITIONS)$/.test(w) && strs.some((s) => POSITION.test(s.toUpperCase()))) {
      rules.push({ field: "position", op: r.scope === "NOT" || r.scope === "EXCLUDE" ? "not_in" : "in", values: strs.map((s) => s.toUpperCase()).filter((s) => POSITION.test(s)) }); continue;
    }
    const idField = w === "LEAGUE_ID" || w === "LEAGUE" ? "league" : w === "NATION_ID" || w === "NATION" ? "nation" : w === "CLUB_ID" || w === "CLUB" || w === "TEAM_ID" ? "club" : null;
    if (idField && nums.length) {
      const m = idField === "league" ? names.leagues : idField === "nation" ? names.nations : names.clubs;
      rules.push({ field: idField, op: "in", values: nums.map((n) => m.get(n) ?? `EA ${n}`) }); continue;
    }
    unread.push(show(r));
  }
  const levels = e.levels.map((l) => l.upgrades.flatMap((u): EvoUpgrade[] => {
    const w = eaWord(u.type), f = statOf(w.replace(/_/g, " "));
    const n = u.values.find((v): v is number => typeof v === "number");
    if (f && f !== "playstyles" && f !== "playstyles_plus" && n !== undefined && n > 0 && n <= 30) return [{ field: f, add: n }];
    const s = u.values.find((v): v is string => typeof v === "string");
    if (/^(PLAYSTYLE|TRAIT)S?$/.test(w) && s) return [{ field: "playstyle", name: s, plus: false }];
    if (/^(PLAYSTYLE|TRAIT)S?_?(PLUS|\+)$|^ICON_TRAIT$/.test(w) && s) return [{ field: "playstyle", name: s, plus: true }];
    if (/^POSITIONS?$/.test(w) && s && POSITION.test(s.toUpperCase())) return [{ field: "position", name: s.toUpperCase() }];
    unread.push(show(u));
    return [];
  })).filter((l) => l.length);
  return { id: `ea:${e.evo_id}`, name: e.name, description: e.description, end_at: e.end_at, coins: e.coins, points: e.points, rules, levels, unread, source: "helper" };
}

// ------------------------------------------------------------------ eligibility and result

const rarityWords = (c: EvoCard) => {
  const v = (c.version ?? "").toLowerCase();
  const out = [v];
  if (c.is_icon) out.push("icon");
  if (c.is_hero) out.push("hero");
  if (/^(rare|common)$/.test(v) || !v) out.push("base"); else out.push("special", "promo");
  if (v === "rare") out.push("rare");
  if (v === "common") out.push("common", "non-rare");
  return out;
};

function numValue(c: EvoCard, f: NumField): number | null {
  if (f === "overall") return c.overall;
  if (f === "skill_moves") return c.skill_moves;
  if (f === "weak_foot") return c.weak_foot;
  if (f === "playstyles") return c.playstyles.length + c.playstyles_plus.length;
  if (f === "playstyles_plus") return c.playstyles_plus.length;
  return c.stats[f] ?? null;
}

export interface RuleCheck { label: string; ok: boolean | null }

export function describeRule(r: EvoRule): string {
  const LABEL: Record<string, string> = { overall: "Overall", pac: "Pace", sho: "Shooting", pas: "Passing", dri: "Dribbling", def: "Defending", phy: "Physical", skill_moves: "Skill moves", weak_foot: "Weak foot", playstyles: "PlayStyles", playstyles_plus: "PlayStyles+", position: "Position", league: "League", nation: "Nation", club: "Club", rarity: "Card type" };
  if ("value" in r) return `${LABEL[r.field]}: ${r.op === "min" ? "Min." : r.op === "max" ? "Max." : "Exactly"} ${r.value}`;
  return `${LABEL[r.field]}: ${r.op === "not_in" ? "not " : ""}${r.values.join(" or ")}`;
}

export function describeUpgrade(u: EvoUpgrade): string {
  if (u.field === "playstyle") return `PlayStyle${u.plus ? "+" : ""}: ${u.name}`;
  if (u.field === "position") return `New position: ${u.name}`;
  const LABEL: Record<string, string> = { overall: "OVR", pac: "Pace", sho: "Shooting", pas: "Passing", dri: "Dribbling", def: "Defending", phy: "Physical", skill_moves: "Skill moves", weak_foot: "Weak foot" };
  return `+${u.add} ${LABEL[u.field]}`;
}

/** Each rule against the card: true, false, or null when the card lacks the data (e.g. no face stats synced). */
export function checkRules(c: EvoCard, rules: EvoRule[]): RuleCheck[] {
  return rules.map((r) => {
    let ok: boolean | null;
    if ("value" in r) {
      const v = numValue(c, r.field);
      ok = v === null ? null : r.op === "min" ? v >= r.value : r.op === "max" ? v <= r.value : v === r.value;
    } else {
      const want = new Set(r.values.map(norm));
      const have = r.field === "position" ? c.positions.map(norm) : r.field === "rarity" ? rarityWords(c).map(norm) : [norm(c[r.field] ?? "")];
      const hit = have.some((h) => want.has(h));
      ok = r.op === "in" ? hit : !hit;
      if (r.field !== "position" && r.field !== "rarity" && !c[r.field]) ok = null;
    }
    return { label: describeRule(r), ok };
  });
}

/** The card after every level (overall capped at 99, face stats at 99, skill moves / weak foot at 5). */
export function evolve(c: EvoCard, levels: EvoUpgrade[][]): EvoCard {
  const out: EvoCard = { ...c, stats: { ...c.stats }, positions: [...c.positions], playstyles: [...c.playstyles], playstyles_plus: [...c.playstyles_plus] };
  for (const u of levels.flat()) {
    if (u.field === "overall") out.overall = Math.min(99, out.overall + u.add);
    else if (u.field === "skill_moves") out.skill_moves = Math.min(5, (out.skill_moves ?? 1) + u.add);
    else if (u.field === "weak_foot") out.weak_foot = Math.min(5, (out.weak_foot ?? 1) + u.add);
    else if (u.field === "playstyle") {
      if (u.plus) { if (!out.playstyles_plus.includes(u.name)) out.playstyles_plus.push(u.name); out.playstyles = out.playstyles.filter((p) => p !== u.name); }
      else if (!out.playstyles.includes(u.name) && !out.playstyles_plus.includes(u.name)) out.playstyles.push(u.name);
    } else if (u.field === "position") { if (!out.positions.includes(u.name)) out.positions.push(u.name); }
    else if (FACE.includes(u.field as Face)) { const k = u.field as Face; if (out.stats[k] !== undefined) out.stats[k] = Math.min(99, out.stats[k]! + u.add); }
  }
  return out;
}

export interface SquadSlotLite { slot: string; position: string; rating: number | null; card_id: string | null }

/** Biggest overall gain in one slot of the squad the evolved card can play (0 when it wouldn't start). */
export function squadGain(before: EvoCard, after: EvoCard, slots: SquadSlotLite[]): { slot: string | null; gain: number } {
  let best = { slot: null as string | null, gain: 0 };
  for (const s of slots) {
    if (!after.positions.some((p) => p === s.position)) continue;
    // The card is already in this slot: the gain is its own improvement.
    const now = s.card_id === before.id ? before.overall : s.rating ?? 0;
    const g = after.overall - now;
    if (g > best.gain) best = { slot: s.slot, gain: g };
  }
  return best;
}

export interface EvoMatch {
  card: EvoCard;
  after: EvoCard;
  checks: RuleCheck[];
  /** false = fails a rule; null = passes what can be checked, but some rules need data we don't have. */
  eligible: boolean | null;
  squad: { slot: string | null; gain: number };
}

/** Club cards ranked for one evolution: eligible first, then the biggest squad gain, then the best result. */
export function matchEvolution(evo: Evolution, cards: EvoCard[], slots: SquadSlotLite[], limit = 15): { eligible: number; maybe: number; matches: EvoMatch[] } {
  const all: EvoMatch[] = [];
  for (const c of cards) {
    const checks = checkRules(c, evo.rules);
    if (checks.some((x) => x.ok === false)) continue;
    const after = evolve(c, evo.levels);
    all.push({ card: c, after, checks, eligible: checks.every((x) => x.ok === true) ? true : null, squad: squadGain(c, after, slots) });
  }
  all.sort((a, b) => Number(b.eligible === true) - Number(a.eligible === true) || b.squad.gain - a.squad.gain || b.after.overall - a.after.overall || (a.card.untradeable === b.card.untradeable ? 0 : a.card.untradeable ? -1 : 1));
  return { eligible: all.filter((m) => m.eligible === true).length, maybe: all.filter((m) => m.eligible === null).length, matches: all.slice(0, limit) };
}
