// What kind of night an event is, read from its title first (Practice / BYOT / League ...)
export function eventKind(title: string, type?: string | null): string {
  const t = (title || "").toLowerCase();
  if (/\b(practice|training|session)\b/.test(t)) return "Practice";
  if (/\bbyot\b/.test(t)) return "BYOT";
  if (/\b(tournament|cup|playoff)\b/.test(t)) return "Tournament";
  if (/\bleague\b/.test(t)) return "League";
  if (/\bscrim\b/.test(t)) return "Scrim";
  if (/\bfriendly\b/.test(t)) return "Friendly";
  if (/\btry ?outs?\b/.test(t)) return "Tryout";
  const map: Record<string, string> = { league: "League", training: "Practice", practice: "Practice", tournament: "Tournament", scrim: "Scrim", friendly: "Friendly", tryout: "Tryout" };
  return map[type || ""] || "Match";
}
