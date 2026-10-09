import { rankPhotos, identityInstructions } from "./photo-selection.ts";

Deno.test("original face close-up anchors identity ahead of matching poses and generated art", () => {
  const photos = [
    { image_url: "generated", pose: "captain", source_kind: "generated", graphic_kind: "card", analysis: { club_name: "Palermo" } },
    { image_url: "body", pose: "captain", source_kind: "upload" },
    { image_url: "face", pose: "profile", source_kind: "upload" },
    { image_url: "rear", pose: "profile", source_kind: "upload", analysis: { description: "Rear-facing pro with blue curls" } },
  ];
  const ranked = rankPhotos(photos, "captain", "card", "Palermo").map(p => p.image_url);
  if (JSON.stringify(ranked) !== JSON.stringify(["face", "body"])) throw new Error("Identity anchor must outrank pose and generated art");
});

Deno.test("equally suitable original references remain stable between editions", () => {
  const photos = ["new", "old"].map(image_url => ({ image_url, pose: "profile", source_kind: "upload" }));
  for (let i = 0; i < 40; i++) {
    if (rankPhotos(photos, "stride", "card", "P")[0]?.image_url !== "new") throw new Error("Identity anchor rotated");
  }
});

Deno.test("generated-only and rear-only collections never supply an invented face", () => {
  const ranked = rankPhotos([
    { image_url: "generated", source_kind: "generated" },
    { image_url: "rear", source_kind: "upload", analysis: { description: "back to the camera" } },
  ], "ready", "card", "P");
  if (ranked.length) throw new Error("Unsafe identity fallback");
});

Deno.test("AirDangus traits are anchored to ordered original references, not vintage grading", () => {
  const prompt = identityInstructions(["voluminous blue curls, long blue beard and curled moustache, pink-framed mirrored sports glasses", "tattooed limbs and white wrist wraps"]);
  for (const text of ["Reference image 1 is the authoritative original face anchor", "long blue beard", "pink-framed mirrored sports glasses", "Reference image 2 visible details: tattooed limbs", "not to identity-defining hair, beard or eyewear colours", "ordinary eyeglasses"]) {
    if (!prompt.includes(text)) throw new Error(`Missing likeness constraint: ${text}`);
  }
});
