// Build Archetype ID to Name mapping for EA FC Pro Clubs
// These are the actual player BUILD archetypes from the EA API

export interface ArchetypeInfo {
  name: string;
  category: "GK" | "DEF" | "MID" | "FWD";
  color: string; // Tailwind color class suffix
}

// Correct EA FC 26 Pro Clubs Build Archetypes
export const ARCHETYPE_MAP: Record<string, ArchetypeInfo> = {
  // Goalkeepers
  "1":  { name: "Shot Stopper", category: "GK", color: "yellow" },
  "2":  { name: "Sweeper Keeper", category: "GK", color: "yellow" },
  
  // Defenders (Boss, Engine, Progressor, Marauder)
  "3":  { name: "Progressor", category: "DEF", color: "blue" },
  "4":  { name: "Boss", category: "DEF", color: "blue" },
  "5":  { name: "Engine", category: "DEF", color: "blue" },
  "6":  { name: "Marauder", category: "DEF", color: "blue" },
  
  // Midfielders (Recycler, Maestro, Creator, Spark)
  "7":  { name: "Recycler", category: "MID", color: "green" },
  "8":  { name: "Maestro", category: "MID", color: "green" },
  "9":  { name: "Creator", category: "MID", color: "green" },
  "10": { name: "Spark", category: "MID", color: "green" },
  
  // Forwards (Magician, Finisher, Target)
  "11": { name: "Magician", category: "FWD", color: "red" },
  "12": { name: "Finisher", category: "FWD", color: "red" },
  "13": { name: "Target", category: "FWD", color: "red" },
  
  // Fallback for unknown GK archetype
  "30": { name: "Goalkeeper", category: "GK", color: "yellow" },
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

/**
 * Infer the most likely individual position(s) based on Build Archetype + Positional Category.
 * 
 * Build Archetypes are tied to positional categories but we can further refine:
 * - Marauder (DEF) → LB/RB (fullback-style)
 * - Boss (DEF) → CB (physical center-back)
 * - Engine (DEF) → CB/LB/RB (versatile)
 * - Progressor (DEF) → CB (ball-playing)
 * - Spark (MID) → LM/RM/LW/RW (wide playmaker)
 * - Maestro (MID) → CM/CDM (deep orchestrator)
 * - Creator (MID) → CAM/CM (attacking mid)
 * - Recycler (MID) → CDM/CM (holding)
 * - Magician (FWD) → LW/RW/CAM (creative wide)
 * - Finisher (FWD) → ST (goal scorer)
 * - Target (FWD) → ST (hold-up striker)
 */
export function inferPosition(
  archetypeId: string | number | null | undefined,
  positionalCategory?: string | null
): string | null {
  if (!archetypeId) return null;
  
  const id = String(archetypeId);
  const info = ARCHETYPE_MAP[id];
  if (!info) return null;
  
  // Use archetype to infer position
  switch (id) {
    // GK
    case "1": // Shot Stopper
    case "2": // Sweeper Keeper
    case "30": // Goalkeeper fallback
      return "GK";
    
    // Defenders
    case "3": // Progressor - ball-playing CB
      return "CB";
    case "4": // Boss - physical CB
      return "CB";
    case "5": // Engine - versatile
      return "CB/FB";
    case "6": // Marauder - attacking fullback
      return "LB/RB";
    
    // Midfielders
    case "7": // Recycler - holding mid
      return "CDM";
    case "8": // Maestro - deep playmaker
      return "CM";
    case "9": // Creator - attacking mid
      return "CAM";
    case "10": // Spark - wide playmaker
      return "LM/RM";
    
    // Forwards
    case "11": // Magician - creative winger
      return "LW/RW";
    case "12": // Finisher - goal scorer
      return "ST";
    case "13": // Target - hold-up striker
      return "ST";
    
    default:
      return null;
  }
}

/**
 * Get the primary inferred position from position_counts
 */
export function getPrimaryPosition(positionCounts: Record<string, number> | null | undefined): string | null {
  if (!positionCounts || Object.keys(positionCounts).length === 0) return null;
  
  const sorted = Object.entries(positionCounts)
    .sort((a, b) => b[1] - a[1]);
  
  return sorted[0]?.[0] || null;
}

// Positional category helpers
export function getPositionalCategoryBadgeClasses(category: string | null | undefined): string {
  const normalizedCategory = category?.toLowerCase();
  switch (normalizedCategory) {
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

export function formatPositionalCategory(category: string | null | undefined): string {
  if (!category) return "";
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}
