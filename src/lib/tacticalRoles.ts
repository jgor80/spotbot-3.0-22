// FC 26 Tactical Roles and Position Inference
// archetypeid from EA API = Tactical Role (base name without variant)

export interface TacticalRoleInfo {
  name: string;
  baseRole: string; // Without variant like "- Defend"
  inferredPositions: string[]; // Possible individual positions
  category: "GK" | "DEF" | "MID" | "FWD";
  color: string;
}

// Maps archetypeid from EA API to Tactical Role info
// These are the BASE role names (EA API doesn't include variants like "- Defend")
export const TACTICAL_ROLE_MAP: Record<string, TacticalRoleInfo> = {
  // Goalkeepers
  "1": { 
    name: "Shot Stopper", 
    baseRole: "Goalkeeper",
    inferredPositions: ["GK"],
    category: "GK", 
    color: "yellow" 
  },
  "2": { 
    name: "Sweeper Keeper", 
    baseRole: "Sweeper Keeper",
    inferredPositions: ["GK"],
    category: "GK", 
    color: "yellow" 
  },
  
  // Defenders - CB roles
  "3": { 
    name: "Defender", 
    baseRole: "Defender",
    inferredPositions: ["CB"],
    category: "DEF", 
    color: "blue" 
  },
  "4": { 
    name: "Ball Playing Defender", 
    baseRole: "Ball-Playing Defender",
    inferredPositions: ["CB"],
    category: "DEF", 
    color: "blue" 
  },
  
  // Defenders - Fullback roles (LB/RB)
  "5": { 
    name: "Fullback", 
    baseRole: "Fullback",
    inferredPositions: ["LB", "RB"],
    category: "DEF", 
    color: "blue" 
  },
  "6": { 
    name: "Falseback", 
    baseRole: "Falseback",
    inferredPositions: ["LB", "RB"],
    category: "DEF", 
    color: "blue" 
  },
  
  // Midfielders - Defensive
  "7": { 
    name: "Holding", 
    baseRole: "Holding",
    inferredPositions: ["CDM", "CM"],
    category: "MID", 
    color: "green" 
  },
  "8": { 
    name: "Centre-Half", 
    baseRole: "Centre Half",
    inferredPositions: ["CDM"],
    category: "MID", 
    color: "green" 
  },
  
  // Midfielders - Central
  "9": { 
    name: "Box-to-Box", 
    baseRole: "Box-to-Box",
    inferredPositions: ["CM"],
    category: "MID", 
    color: "green" 
  },
  "10": { 
    name: "Playmaker", 
    baseRole: "Playmaker",
    inferredPositions: ["CM", "CAM"],
    category: "MID", 
    color: "green" 
  },
  
  // Forwards - Wide
  "11": { 
    name: "Winger", 
    baseRole: "Winger",
    inferredPositions: ["LW", "RW", "LM", "RM"],
    category: "FWD", 
    color: "red" 
  },
  "12": { 
    name: "Inside Forward", 
    baseRole: "Inside Forward",
    inferredPositions: ["LW", "RW", "LM", "RM"],
    category: "FWD", 
    color: "red" 
  },
  
  // Forwards - Central
  "13": { 
    name: "Striker", 
    baseRole: "Advanced Forward",
    inferredPositions: ["ST", "CF"],
    category: "FWD", 
    color: "red" 
  },
  "30": { 
    name: "Poacher", 
    baseRole: "Poacher",
    inferredPositions: ["ST"],
    category: "FWD", 
    color: "red" 
  },
};

// Additional tactical roles that might appear
export const EXTENDED_TACTICAL_ROLES: Record<string, TacticalRoleInfo> = {
  // Wingback variants (LB/RB)
  "14": { 
    name: "Wingback", 
    baseRole: "Wingback",
    inferredPositions: ["LB", "RB", "LWB", "RWB"],
    category: "DEF", 
    color: "blue" 
  },
  "15": { 
    name: "Inverted Wingback", 
    baseRole: "Inverted Wingback",
    inferredPositions: ["LB", "RB"],
    category: "DEF", 
    color: "blue" 
  },
  "16": { 
    name: "Attacking Wingback", 
    baseRole: "Attacking Wingback",
    inferredPositions: ["LB", "RB", "LWB", "RWB"],
    category: "DEF", 
    color: "blue" 
  },
  
  // CB variants
  "17": { 
    name: "Stopper", 
    baseRole: "Stopper",
    inferredPositions: ["CB"],
    category: "DEF", 
    color: "blue" 
  },
  "18": { 
    name: "Wide Back", 
    baseRole: "Wide Back",
    inferredPositions: ["CB"],
    category: "DEF", 
    color: "blue" 
  },
  
  // Midfielder variants
  "19": { 
    name: "Deep-Lying Playmaker", 
    baseRole: "Deep-Lying Playmaker",
    inferredPositions: ["CDM", "CM"],
    category: "MID", 
    color: "green" 
  },
  "20": { 
    name: "Half Winger", 
    baseRole: "Half Winger",
    inferredPositions: ["CM", "CAM"],
    category: "MID", 
    color: "green" 
  },
  "21": { 
    name: "Shadow Striker", 
    baseRole: "Shadow Striker",
    inferredPositions: ["CAM"],
    category: "MID", 
    color: "green" 
  },
  "22": { 
    name: "Classic 10", 
    baseRole: "Classic 10",
    inferredPositions: ["CAM"],
    category: "MID", 
    color: "green" 
  },
  "23": { 
    name: "Wide Half", 
    baseRole: "Wide Half",
    inferredPositions: ["CDM"],
    category: "MID", 
    color: "green" 
  },
  "24": { 
    name: "Box Crasher", 
    baseRole: "Box Crasher",
    inferredPositions: ["CDM"],
    category: "MID", 
    color: "green" 
  },
  
  // Wide midfielder variants
  "25": { 
    name: "Wide Playmaker", 
    baseRole: "Wide Playmaker",
    inferredPositions: ["LW", "RW", "LM", "RM"],
    category: "FWD", 
    color: "red" 
  },
  "26": { 
    name: "Wide Midfielder", 
    baseRole: "Wide Midfielder",
    inferredPositions: ["LM", "RM"],
    category: "MID", 
    color: "green" 
  },
  
  // Striker variants
  "27": { 
    name: "Target Forward", 
    baseRole: "Target Forward",
    inferredPositions: ["ST"],
    category: "FWD", 
    color: "red" 
  },
  "28": { 
    name: "False 9", 
    baseRole: "False 9",
    inferredPositions: ["ST", "CF"],
    category: "FWD", 
    color: "red" 
  },
};

// Combine all maps
const ALL_ROLES = { ...TACTICAL_ROLE_MAP, ...EXTENDED_TACTICAL_ROLES };

export function getTacticalRoleName(roleId: string | number | null | undefined): string {
  if (!roleId) return "";
  return ALL_ROLES[String(roleId)]?.name || "";
}

export function getTacticalRoleInfo(roleId: string | number | null | undefined): TacticalRoleInfo | null {
  if (!roleId) return null;
  return ALL_ROLES[String(roleId)] || null;
}

export function getTacticalRoleBadgeClasses(category: TacticalRoleInfo["category"] | null): string {
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

// Infer specific position from tactical role
export function inferPositionFromRole(roleId: string | number | null | undefined): string[] {
  if (!roleId) return [];
  return ALL_ROLES[String(roleId)]?.inferredPositions || [];
}

// Get most likely position (first in the list)
export function getPrimaryInferredPosition(roleId: string | number | null | undefined): string | null {
  const positions = inferPositionFromRole(roleId);
  return positions[0] || null;
}

// Calculate the most used tactical role from role counts
export function getMostUsedTacticalRole(roleCounts: Record<string, number> | null | undefined): string | null {
  if (!roleCounts || Object.keys(roleCounts).length === 0) return null;
  
  const sorted = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1]);
  
  return sorted[0]?.[0] || null;
}

// Positional Categories (from position_played field)
export const POSITIONAL_CATEGORIES = {
  goalkeeper: { name: "Goalkeeper", positions: ["GK"] },
  defender: { name: "Defender", positions: ["LB", "RB", "CB", "LWB", "RWB"] },
  midfielder: { name: "Midfielder", positions: ["CDM", "CM", "CAM", "LM", "RM"] },
  forward: { name: "Forward", positions: ["LW", "RW", "CF", "ST"] },
} as const;

export function getPositionalCategoryName(category: string | null | undefined): string {
  if (!category) return "";
  const normalized = category.toLowerCase();
  return POSITIONAL_CATEGORIES[normalized as keyof typeof POSITIONAL_CATEGORIES]?.name || category;
}

// Get badge classes for positional category (goalkeeper, defender, midfielder, forward)
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

// Format positional category for display
export function formatPositionalCategory(category: string | null | undefined): string {
  if (!category) return "";
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}
