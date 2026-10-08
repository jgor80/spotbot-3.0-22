import { rankPhotos } from "./photo-selection.ts";

Deno.test("pose references prefer original matches, then matching club graphics", () => {
  const photos = [
    { image_url: "other-club", pose: "celebrate", source_kind: "generated", graphic_kind: "card", analysis: { club_name: "Other" } },
    { image_url: "neutral", pose: "ready", source_kind: "upload" },
    { image_url: "generated", pose: "celebrate", source_kind: "generated", graphic_kind: "card", analysis: { club_name: "Palermo" } },
    { image_url: "original", pose: "celebrate", source_kind: "upload" },
  ];
  const ranked = rankPhotos(photos, "celebrate", "card", "Palermo").map((p) => p.image_url);
  if (JSON.stringify(ranked) !== JSON.stringify(["original", "generated", "neutral"])) throw new Error("Incorrect pose reference ordering");
});

Deno.test("no pose match keeps newest originals before generated fallbacks", () => {
  const ranked = rankPhotos([
    { image_url: "new", source_kind: "upload" },
    { image_url: "old", source_kind: "upload" },
    { image_url: "banner", source_kind: "generated", graphic_kind: "banner", analysis: { club_name: "Palermo" } },
  ], "ready", "card", "Palermo");
  if (ranked.length !== 2 || ranked[0].image_url !== "new") throw new Error("Incorrect fallback");
});