export type PhotoAsset = {
  image_url: string;
  pose?: string | null;
  source_kind?: string;
  graphic_kind?: string | null;
  analysis?: { club_name?: string; kit_number?: number | null } | null;
};

// Input order is newest first. Uploads matching the requested pose come first, then matching-club
// generated art, then other uploads. Within a tier references are shuffled so the same photo isn't reused every time.
export function rankPhotos(assets: PhotoAsset[], pose: string, kind: string, club: string, rng: () => number = Math.random) {
  const eligible = assets.filter((p) => p.source_kind === "upload" ||
    (p.source_kind === "generated" && p.graphic_kind === kind && p.analysis?.club_name === club));
  const score = (p: PhotoAsset) => p.pose === pose ? (p.source_kind === "upload" ? 4 : 3) : (p.source_kind === "upload" ? 2 : 1);
  return eligible.map((asset) => ({ asset, r: rng() })).sort((a, b) => score(b.asset) - score(a.asset) || a.r - b.r).map(({ asset }) => asset);
}
