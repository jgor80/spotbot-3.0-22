import { LineupSlot } from "@/types/player";
import { FormationType } from "@/types/formations";
import { FORMATIONS, getPositionColor, getPositionRatingCategory } from "@/lib/formations";
import { cn } from "@/lib/utils";

interface PositionRating {
  discord_user_id: string;
  position: string;
  rating: number;
}

interface FormationPitchProps {
  formation: FormationType;
  slots: LineupSlot[];
  onSlotClick?: (slotIndex: number) => void;
  selectedSlot?: number | null;
  interactive?: boolean;
  positionRatings?: PositionRating[];
}

export function FormationPitch({ 
  formation, 
  slots, 
  onSlotClick, 
  selectedSlot,
  interactive = true,
  positionRatings = []
}: FormationPitchProps) {
  const positions = FORMATIONS[formation];

  // Get the position-specific rating for a player at a given formation position
  const getPlayerPositionRating = (discordUserId: string, formationPosition: string): number | null => {
    const ratingCategory = getPositionRatingCategory(formationPosition);
    const posRating = positionRatings.find(
      pr => pr.discord_user_id === discordUserId && pr.position === ratingCategory
    );
    return posRating?.rating ?? null;
  };

  return (
    <div className="relative w-full aspect-[3/4] bg-gradient-to-b from-primary/20 to-primary/10 rounded-xl border-2 border-primary/30 overflow-hidden">
      {/* Pitch markings */}
      <div className="absolute inset-0">
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-primary/20 rounded-full" />
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary/20" />
        
        {/* Penalty areas */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-t-2 border-l-2 border-r-2 border-primary/20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-b-2 border-l-2 border-r-2 border-primary/20" />
        
        {/* Goal areas */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/4 h-[6%] border-t-2 border-l-2 border-r-2 border-primary/20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/4 h-[6%] border-b-2 border-l-2 border-r-2 border-primary/20" />
      </div>

      {/* Player positions */}
      {positions.map((pos, index) => {
        const slot = slots.find(s => s.slot_index === index);
        const isSelected = selectedSlot === index;
        const isEmpty = !slot;
        
        // Get position-specific rating or fall back to overall rating
        const displayRating = slot 
          ? getPlayerPositionRating(slot.discord_user_id, pos.position) ?? slot.rating
          : undefined;
        
        // Get full display name
        const displayName = slot?.discord_username || slot?.ea_username || "?";

        return (
          <div
            key={index}
            onClick={() => interactive && onSlotClick?.(index)}
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div
              className={cn(
                "flex flex-col items-center gap-0.5 transition-all",
                interactive && "cursor-pointer hover:scale-110",
                isSelected && "scale-110"
              )}
            >
              {/* Rating badge on top */}
              {slot && displayRating !== undefined && (
                <div className="bg-background/90 text-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-t shadow-sm border border-b-0 border-border/50">
                  {Math.round(displayRating)}
                </div>
              )}
              
              {/* Player circle */}
              <div
                className={cn(
                  "relative flex items-center justify-center rounded-full border-2 shadow-lg transition-all",
                  isEmpty
                    ? "h-10 w-10 md:h-12 md:w-12 border-dashed border-muted-foreground/50 bg-background/50"
                    : "h-10 w-10 md:h-12 md:w-12 border-background",
                  isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-background"
                )}
                style={{ 
                  backgroundColor: isEmpty ? undefined : getPositionColor(pos.position),
                }}
              >
                {!slot && (
                  <span className="text-lg text-muted-foreground">+</span>
                )}
              </div>

              {/* Player name label */}
              <div className="bg-background/90 text-foreground text-[9px] md:text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-sm max-w-[70px] md:max-w-[90px] truncate text-center border border-border/50">
                {slot ? displayName : pos.position}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
