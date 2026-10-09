export type PhotoAsset = {
  id?: string;
  image_url: string;
  pose?: string | null;
  source_kind?: string;
  graphic_kind?: string | null;
  analysis?: { club_name?: string; kit_number?: number | null; description?: string; screen?: string } | null;
};

export const isRearFacing = (description?: string | null) => /\b(rear(?:-facing)?|from behind|back view|back to (the )?camera|facing away)\b/i.test(description || "");

// Input is newest first. Stable face close-ups outrank pose variety: generated images are
// display assets, never identity evidence. Keep the same anchor between creative editions.
export function rankPhotos(assets: PhotoAsset[], pose: string, _kind: string, _club: string, _rng?: () => number) {
  const eligible = assets.filter((p) => p.source_kind === "upload" && !isRearFacing(p.analysis?.description));
  const score = (p: PhotoAsset) => p.pose === "profile" ? 4 : /close.?up|head.and.shoulders/i.test(p.analysis?.description || "") ? 3 : p.pose === pose ? 2 : 1;
  return eligible.map((asset, index) => ({ asset, index })).sort((a, b) => score(b.asset) - score(a.asset) || a.index - b.index).map(({ asset }) => asset);
}

export function identityInstructions(descriptions: (string | null)[]) {
  return `IDENTITY IS THE HIGHEST PRIORITY, above pose, era, lighting and style. Reference image 1 is the authoritative original face anchor: preserve its exact face geometry, nose, jaw, skin tone, hair texture and colour, beard length and colour, moustache shape, glasses frame and lens tint. Do not shorten or recolour a beard, replace sports glasses with ordinary eyeglasses, beautify, age or humanize the character. Additional reference images show the SAME player's original uploads for body, tattoos, accessories and pose; never blend them into a new face. If references differ, image 1 controls facial identity. Change only club clothing, body pose and background; retain the anchor's head angle when a new angle would invent facial details. Style and vintage colour grading apply to the surroundings, not to identity-defining hair, beard or eyewear colours. ${descriptions.map((d, i) => d ? `Reference image ${i + 1} visible details: ${d.replace(/\s+/g, " ").slice(0, 600)}` : "").filter(Boolean).join(" ")}`;
}
