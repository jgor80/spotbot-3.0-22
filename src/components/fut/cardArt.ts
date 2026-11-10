// GafferBot's own FUT card look: colours by card type, drawn in the browser. No EA or FUT.GG artwork is used.
// Presentation only; nothing here feeds chemistry, prices or analysis.

export interface CardArtInput {
  rating?: number | null;
  version?: string | null;
  is_icon?: boolean;
  is_hero?: boolean;
  /** Market Lab's card category (base, promo, icon, hero, ...), when that's all we have. */
  category?: string | null;
}

export interface CardTheme {
  kind: "gold" | "silver" | "bronze" | "icon" | "hero" | "promo";
  /** Background of the card face. */
  background: string;
  /** The thin outer frame. */
  frame: string;
  text: string;
  accent: string;
  label: string;
}

// Names EA and FUT.GG use for ordinary (non-promo) cards
const BASE_VERSION = /^(?:base|normal|standard|(?:rare|common|non[- ]?rare)(?: (?:gold|silver|bronze))?|(?:gold|silver|bronze)(?: (?:rare|common|non[- ]?rare))?)$/i;

export function isBaseVersion(version?: string | null): boolean {
  const v = (version ?? "").trim();
  return v === "" || BASE_VERSION.test(v);
}

/** Same version name, same colour: a stable hue from the name. */
export function versionHue(version: string): number {
  let h = 0;
  for (const ch of version.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // Skip the purples (Hero cards) and yellows (gold cards) so a promo never looks like either
  const free = [[0, 35], [70, 240], [295, 360]] as const;
  const span = free.reduce((n, [a, b]) => n + b - a, 0);
  let x = h % span;
  for (const [a, b] of free) { if (x < b - a) return a + x; x -= b - a; }
  return 0;
}

export function cardTheme(card: CardArtInput): CardTheme {
  const category = (card.category ?? "").toLowerCase();
  const version = (card.version ?? "").trim();
  if (card.is_icon || category === "icon" || /^icons?$/i.test(version)) return {
    kind: "icon", label: version && !/^icons?$/i.test(version) ? version : "Icon",
    background: "linear-gradient(160deg, #fffaf0 0%, #f3e5bd 45%, #d9bf7c 100%)", frame: "#b8954a", text: "#3a2c0e", accent: "#9a7425",
  };
  if (card.is_hero || category === "hero" || /^(?:fut |ultimate team )?heroe?s?$/i.test(version)) return {
    kind: "hero", label: version && !/^heroe?s?$/i.test(version) ? version : "Hero",
    background: "linear-gradient(160deg, #7b4ae0 0%, #4a23a0 50%, #241050 100%)", frame: "#f2c94c", text: "#ffffff", accent: "#f2c94c",
  };
  const promo = !isBaseVersion(version) || (category !== "" && category !== "base");
  if (promo) {
    const h = versionHue(version || category);
    return {
      kind: "promo", label: version || category.replace(/_/g, " "),
      background: `linear-gradient(160deg, hsl(${h} 55% 34%) 0%, hsl(${h} 60% 20%) 55%, hsl(${(h + 25) % 360} 65% 10%) 100%)`,
      frame: `hsl(${h} 85% 62%)`, text: "#ffffff", accent: `hsl(${h} 90% 72%)`,
    };
  }
  const rating = card.rating ?? 0;
  const rare = /rare/i.test(version) && !/non[- ]?rare|common/i.test(version);
  if (rating >= 75) return {
    kind: "gold", label: rare ? "Rare gold" : "Gold",
    background: "linear-gradient(160deg, #fbeea4 0%, #e3c25a 45%, #a57d1f 100%)", frame: "#8a6512", text: "#2b2008", accent: "#6b4c0b",
  };
  if (rating >= 65) return {
    kind: "silver", label: rare ? "Rare silver" : "Silver",
    background: "linear-gradient(160deg, #f6f8fa 0%, #c9d0d7 45%, #8b959f 100%)", frame: "#6c7680", text: "#1b2127", accent: "#46505a",
  };
  return {
    kind: "bronze", label: rare ? "Rare bronze" : "Bronze",
    background: "linear-gradient(160deg, #f0c9a0 0%, #c38a55 45%, #7d4c26 100%)", frame: "#5e3818", text: "#26140a", accent: "#5e3818",
  };
}

/** EA's face file is named by the base player id: special versions share their player's face. */
export function faceUrl(portraitBase: string | null | undefined, eaItemId: number | null | undefined): string | null {
  if (!portraitBase || eaItemId == null || !Number.isFinite(eaItemId) || eaItemId <= 0) return null;
  return `${portraitBase}${Math.trunc(eaItemId) % 16_777_216}.png`;
}

/** "Kylian Mbappé" -> "Mbappé": the card shows the surname unless the name is a single word. */
export function cardName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name.trim();
  const last = parts[parts.length - 1]!;
  // Keep particles with the surname: "Van Dijk", "De Bruyne"
  const particle = parts[parts.length - 2]!;
  return /^(?:van|von|de|da|di|du|del|der|dos|le|la|ten|ter|el|al)$/i.test(particle) ? `${particle} ${last}` : last;
}

const TIER: Partial<Record<CardTheme["kind"], number>> = { bronze: 1, silver: 2, gold: 3 };
/** EA's background for a base card (common or rare gold/silver/bronze). Promos, Icons and Heroes have none: null. */
export function backgroundUrl(backgroundBase: string | null | undefined, theme: CardTheme): string | null {
  const tier = TIER[theme.kind];
  if (!backgroundBase || !tier) return null;
  return `${backgroundBase}cards_bg_e_1_${theme.label.startsWith("Rare") ? 1 : 0}_${tier}.png`;
}
