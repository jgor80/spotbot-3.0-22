export type PhotoAsset = {
  image_url: string;
  pose?: string | null;
  source_kind?: string;
  graphic_kind?: string | null;
  analysis?: { club_name?: string } | null;
};

// Input order is newest first. Prefer a matching uploaded pose to avoid render drift.
export function rankPhotos(assets: PhotoAsset[], pose: string, kind: string, club: string) {
  const eligible = assets.filter((p) => p.source_kind === "upload" ||
    (p.source_kind === "generated" && p.graphic_kind === kind && p.analysis?.club_name === club));
  const score = (p: PhotoAsset) => p.pose === pose ? (p.source_kind === "upload" ? 4 : 3) : (p.source_kind === "upload" ? 2 : 1);
  return eligible.map((asset, index) => ({ asset, index })).sort((a, b) => score(b.asset) - score(a.asset) || a.index - b.index).map(({ asset }) => asset);
}