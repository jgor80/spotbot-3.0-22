// Card art addresses from the XI Lab helper (0.8.0+): the addresses of card backgrounds the EA Web App loaded while a
// user browsed. Public EA file addresses only, checked again here; shared, and who sent them isn't kept. Used to learn
// EA's naming for promo, Icon and Hero backgrounds so cards can load them straight from EA (see card-images.ts).
import { FutError, type FutDb } from "./service.ts";

export const MAX_ART_URLS = 400;
const IMAGE = /\.(?:png|webp|jpe?g|svg|avif)$/i;

/** The address kept for one sighting, or null when it isn't an https EA image address. */
export function cleanArtUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 400) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname;
  const ea = host === "ea.com" || host.endsWith(".ea.com") || host.endsWith(".easports.com") || host.endsWith(".eamobile.com") || host.endsWith(".akamaized.net");
  if (u.protocol !== "https:" || !ea || u.username || u.password || u.port || !IMAGE.test(u.pathname)) return null;
  return `${u.origin}${u.pathname}`;
}

export async function importCardArt(db: FutDb, body: unknown): Promise<{ received: number; kept: number; new_addresses: number }> {
  const b = body && typeof body === "object" ? body as Record<string, unknown> : null;
  if (!b || b.format !== "xilab-image-addresses" || !Array.isArray(b.images)) throw new FutError("Send the helper's card art file (format xilab-image-addresses).");
  const raw = b.images.slice(0, MAX_ART_URLS).map((x) => (x && typeof x === "object" ? (x as { url?: unknown }).url : x));
  const urls = [...new Set(raw.map(cleanArtUrl).filter((u): u is string => !!u))];
  if (!urls.length) return { received: b.images.length, kept: 0, new_addresses: 0 };
  const { data, error } = await db.rpc("record_card_art", { p_urls: urls });
  if (error) throw new Error(error.message);
  return { received: b.images.length, kept: urls.length, new_addresses: Number(data ?? 0) };
}

export interface CardArtSeen { url: string; first_seen_at: string; last_seen_at: string; sightings: number }

/** Newest sightings first. */
export async function listCardArt(db: FutDb, limit = 300): Promise<CardArtSeen[]> {
  const { data, error } = await db.from("ea_card_art").select("url, first_seen_at, last_seen_at, sightings").order("last_seen_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CardArtSeen[];
}
