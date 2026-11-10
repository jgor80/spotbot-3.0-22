import { describe, expect, test } from "bun:test";
const { cardTheme, cardName, faceUrl, isBaseVersion, backgroundUrl } = await import("./cardArt");

describe("FUT card art (GafferBot's own design)", () => {
  test("base cards are coloured by rating", () => {
    expect(cardTheme({ rating: 75 }).kind).toBe("gold");
    expect(cardTheme({ rating: 74, version: "Rare" }).kind).toBe("silver");
    expect(cardTheme({ rating: 64, version: "Common Bronze" }).kind).toBe("bronze");
    expect(cardTheme({ rating: 88, version: "Rare Gold" }).label).toBe("Rare gold");
  });
  test("icons, heroes and promos get their own looks", () => {
    expect(cardTheme({ rating: 90, is_icon: true }).kind).toBe("icon");
    expect(cardTheme({ rating: 90, version: "Icon" }).kind).toBe("icon");
    expect(cardTheme({ rating: 88, is_hero: true }).kind).toBe("hero");
    expect(cardTheme({ rating: 88, category: "hero" }).kind).toBe("hero");
    const totw = cardTheme({ rating: 86, version: "Team of the Week" });
    expect(totw.kind).toBe("promo");
    expect(totw.label).toBe("Team of the Week");
    expect(cardTheme({ rating: 80, version: "Team of the Week" }).background).toBe(totw.background);
    expect(cardTheme({ rating: 80, category: "evolution" }).kind).toBe("promo");
    expect(isBaseVersion("Non-Rare Silver")).toBe(true);
  });
  test("faces use the base player id and only when the server gives a folder", () => {
    expect(faceUrl("https://ea/p/", 231747)).toBe("https://ea/p/231747.png");
    expect(faceUrl("https://ea/p/", 50563507)).toBe(`https://ea/p/${50563507 % 16777216}.png`);
    expect(faceUrl(null, 231747)).toBeNull();
    expect(faceUrl("https://ea/p/", null)).toBeNull();
  });
  test("cards show the surname", () => {
    expect(cardName("Kylian Mbappé")).toBe("Mbappé");
    expect(cardName("Virgil van Dijk")).toBe("van Dijk");
    expect(cardName("Vinícius")).toBe("Vinícius");
  });
});

describe("EA card backgrounds (only with FUT_EA_IMAGES on)", () => {
  test("base cards map to EA's common/rare gold, silver, bronze", () => {
    expect(backgroundUrl("B/", cardTheme({ rating: 88, version: "Rare" }))).toBe("B/cards_bg_e_1_1_3.png");
    expect(backgroundUrl("B/", cardTheme({ rating: 80 }))).toBe("B/cards_bg_e_1_0_3.png");
    expect(backgroundUrl("B/", cardTheme({ rating: 70, version: "Rare" }))).toBe("B/cards_bg_e_1_1_2.png");
    expect(backgroundUrl("B/", cardTheme({ rating: 60, version: "Common" }))).toBe("B/cards_bg_e_1_0_1.png");
  });
  test("promos, icons and heroes and the switch off get none", () => {
    expect(backgroundUrl("B/", cardTheme({ rating: 90, version: "Team of the Week" }))).toBeNull();
    expect(backgroundUrl("B/", cardTheme({ rating: 90, is_icon: true }))).toBeNull();
    expect(backgroundUrl(null, cardTheme({ rating: 88 }))).toBeNull();
  });
});
