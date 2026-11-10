// EA images on FUT cards: player faces and the base gold/silver/bronze card backgrounds. Off unless FUT_EA_IMAGES=on
// (FUT_EA_FACES=on still works). Jeff's call on 2026-11-10: EA's images are unlicensed for us (EA's terms allow personal,
// non-commercial use only). Without them cards are GafferBot's own design. When on, the browser loads each image straight
// from EA's public Web App files: nothing is downloaded, stored or re-served by GafferBot.
// EA doesn't publish promo, Icon or Hero backgrounds there, so those cards keep GafferBot's design.
// Only the folder name is looked up here, because it changes every game year and content update.
import { EA_WEB_APP, eaContentBase, type Fetcher } from "./futgg-catalogue.ts";

export interface CardImages {
  /** True when cards may show EA player faces. */
  faces: boolean;
  /** Face URL is portrait_base + (EA item id mod 2^24) + ".png". Null when faces are off or EA can't be reached. */
  portrait_base: string | null;
  /** Base card backgrounds: background_base + "cards_bg_e_1_<rare 0|1>_<tier 1 bronze|2 silver|3 gold>.png". */
  background_base: string | null;
  credit: string | null;
}

const OFF: CardImages = { faces: false, portrait_base: null, background_base: null, credit: null };
const FOUND_FOR = 6 * 3_600_000;
const MISSED_FOR = 10 * 60_000;
let cached: { base: string | null; at: number } | null = null;

export function facesOn(env: (k: string) => string | undefined): boolean {
  return ["FUT_EA_IMAGES", "FUT_EA_FACES"].some((k) => (env(k) ?? "").trim().toLowerCase() === "on");
}

/** Forget the cached folder (tests). */
export function resetCardImages() { cached = null; }

export async function cardImages(env: (k: string) => string | undefined, fetcher: Fetcher, now = Date.now()): Promise<CardImages> {
  if (!facesOn(env)) return OFF;
  if (!cached || now - cached.at > (cached.base ? FOUND_FOR : MISSED_FOR)) {
    let base: string | null = null;
    try {
      const res = await fetcher(EA_WEB_APP);
      if (res.ok) base = `${eaContentBase(await res.text())}items/images/`;
      else await res.body?.cancel();
    } catch (e) {
      console.warn("[fut-api] EA Web App folder lookup failed:", e instanceof Error ? e.message : e);
    }
    // Keep a folder that worked before rather than dropping faces on one failed lookup
    cached = { base: base ?? cached?.base ?? null, at: now };
  }
  if (!cached.base) return OFF;
  return {
    faces: true, portrait_base: `${cached.base}mobile/portraits/`, background_base: `${cached.base}backgrounds/itemBGs/large/`,
    credit: "Player faces and card backgrounds © EA, loaded from EA's FC Web App",
  };
}
