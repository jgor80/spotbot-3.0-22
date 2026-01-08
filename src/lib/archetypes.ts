// Archetype ID to Name mapping for EA FC Pro Clubs
// These are the actual player BUILD archetypes from the EA API

export interface ArchetypeInfo {
  name: string;
  category: "GK" | "DEF" | "MID" | "FWD";
  color: string; // Tailwind color class suffix
}

// Correct EA FC Pro Clubs Build Archetypes
export const ARCHETYPE_MAP: Record<string, ArchetypeInfo> = {
  // Goalkeepers
  "1":  { name: "Shot Stopper", category: "GK", color: "yellow" },
  "2":  { name: "Sweeper Keeper", category: "GK", color: "yellow" },
  // Defenders
  "3":  { name: "Defender", category: "DEF", color: "blue" },
  "4":  { name: "Ball Playing Defender", category: "DEF", color: "blue" },
  "5":  { name: "Fullback", category: "DEF", color: "blue" },
  "6":  { name: "Falseback", category: "DEF", color: "blue" },
  // Midfielders
  "7":  { name: "Holding", category: "MID", color: "green" },
  "8":  { name: "Centre-Half", category: "MID", color: "green" },
  "9":  { name: "Box-to-Box", category: "MID", color: "green" },
  "10": { name: "Playmaker", category: "MID", color: "green" },
  // Forwards
  "11": { name: "Winger", category: "FWD", color: "red" },
  "12": { name: "Inside Forward", category: "FWD", color: "red" },
  "13": { name: "Striker", category: "FWD", color: "red" },
  "30": { name: "Poacher", category: "FWD", color: "red" },
};

export function getArchetypeName(archetypeId: string | number | null | undefined): string {
  if (!archetypeId) return "";
  return ARCHETYPE_MAP[String(archetypeId)]?.name || "";
}

export function getArchetypeInfo(archetypeId: string | number | null | undefined): ArchetypeInfo | null {
  if (!archetypeId) return null;
  return ARCHETYPE_MAP[String(archetypeId)] || null;
}

export function getArchetypeBadgeClasses(category: ArchetypeInfo["category"] | null): string {
  switch (category) {
    case "GK":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "DEF":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "MID":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "FWD":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Calculate the most used archetype from archetype counts
export function getMostUsedArchetype(archetypeCounts: Record<string, number> | null | undefined): string | null {
  if (!archetypeCounts || Object.keys(archetypeCounts).length === 0) return null;
  
  const sorted = Object.entries(archetypeCounts)
    .sort((a, b) => b[1] - a[1]);
  
  return sorted[0]?.[0] || null;
}

// Get tactical role badge classes (for position_played)
export function getTacticalRoleBadgeClasses(role: string | null | undefined): string {
  const normalizedRole = role?.toLowerCase();
  switch (normalizedRole) {
    case "goalkeeper":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "defender":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "midfielder":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "forward":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Capitalize tactical role for display
export function formatTacticalRole(role: string | null | undefined): string {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}
