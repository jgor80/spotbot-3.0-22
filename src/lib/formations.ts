import { FormationPosition, FormationType } from "@/types/player";

export const FORMATIONS: Record<FormationType, FormationPosition[]> = {
  "4-3-3": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CM", x: 30, y: 50 },
    { position: "CM", x: 50, y: 45 },
    { position: "CM", x: 70, y: 50 },
    { position: "LW", x: 20, y: 20 },
    { position: "ST", x: 50, y: 15 },
    { position: "RW", x: 80, y: 20 },
  ],
  "4-4-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "LM", x: 15, y: 45 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "RM", x: 85, y: 45 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 },
  ],
  "3-5-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "CB", x: 25, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 75, y: 75 },
    { position: "LWB", x: 10, y: 50 },
    { position: "CM", x: 30, y: 50 },
    { position: "CDM", x: 50, y: 55 },
    { position: "CM", x: 70, y: 50 },
    { position: "RWB", x: 90, y: 50 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 },
  ],
  "4-2-3-1": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "LAM", x: 20, y: 35 },
    { position: "CAM", x: 50, y: 35 },
    { position: "RAM", x: 80, y: 35 },
    { position: "ST", x: 50, y: 15 },
  ],
  "5-3-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LWB", x: 10, y: 65 },
    { position: "CB", x: 30, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 70, y: 75 },
    { position: "RWB", x: 90, y: 65 },
    { position: "CM", x: 30, y: 48 },
    { position: "CM", x: 50, y: 45 },
    { position: "CM", x: 70, y: 48 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 },
  ],
  "4-1-4-1": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 50, y: 58 },
    { position: "LM", x: 15, y: 40 },
    { position: "CM", x: 35, y: 42 },
    { position: "CM", x: 65, y: 42 },
    { position: "RM", x: 85, y: 40 },
    { position: "ST", x: 50, y: 15 },
  ],
};

export const FORMATION_OPTIONS = Object.keys(FORMATIONS) as FormationType[];

export function getPositionColor(position: string): string {
  if (position === "GK") return "hsl(var(--warning))";
  if (["CB", "LB", "RB", "LWB", "RWB"].includes(position)) return "hsl(var(--info))";
  if (["CM", "CDM", "CAM", "LM", "RM", "LAM", "RAM"].includes(position)) return "hsl(var(--primary))";
  return "hsl(var(--destructive))";
}
