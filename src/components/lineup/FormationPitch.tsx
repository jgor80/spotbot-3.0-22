import { FormationType, LineupSlot } from "@/types/player";
import { FORMATIONS, getPositionColor } from "@/lib/formations";
import { RatingBadge } from "@/components/player/RatingBadge";
import { cn } from "@/lib/utils";

interface FormationPitchProps {
  formation: FormationType;
  slots: LineupSlot[];
  onSlotClick?: (slotIndex: number) => void;
  selectedSlot?: number | null;
  interactive?: boolean;
}

export function FormationPitch({ 
  formation, 
  slots, 
  onSlotClick, 
  selectedSlot,
  interactive = true 
}: FormationPitchProps) {
  const positions = FORMATIONS[formation];

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

        return (
          <div
            key={index}
            onClick={() => interactive && onSlotClick?.(index)}
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                interactive && "cursor-pointer hover:scale-110",
                isSelected && "scale-110"
              )}
            >
              {/* Player circle */}
              <div
                className={cn(
                  "relative flex items-center justify-center rounded-full border-2 shadow-lg transition-all",
                  isEmpty
                    ? "h-10 w-10 md:h-12 md:w-12 border-dashed border-muted-foreground/50 bg-background/50"
                    : "h-12 w-12 md:h-14 md:w-14 border-background bg-card",
                  isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-background"
                )}
                style={{ 
                  backgroundColor: isEmpty ? undefined : getPositionColor(pos.position),
                }}
              >
                {slot ? (
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-primary-foreground truncate max-w-[40px]">
                      {slot.discord_username?.slice(0, 4) || "?"}
                    </span>
                    {slot.rating !== undefined && (
                      <span className="text-[10px] font-bold text-primary-foreground/80">
                        {Math.round(slot.rating)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-lg text-muted-foreground">+</span>
                )}
              </div>

              {/* Position label */}
              <span className="text-[10px] font-bold text-foreground/80 bg-background/80 px-1.5 py-0.5 rounded">
                {pos.position}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
