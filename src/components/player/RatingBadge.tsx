import { cn } from "@/lib/utils";

interface RatingBadgeProps {
  rating: number;
  size?: "sm" | "md" | "lg" | "xl";
  showTier?: boolean;
  className?: string;
}

function getRatingTier(rating: number) {
  if (rating >= 85) return { name: "Elite", textClass: "text-tier-elite", bgClass: "bg-gradient-hero" };
  if (rating >= 75) return { name: "Gold", textClass: "text-tier-gold", bgClass: "bg-gradient-gold" };
  if (rating >= 60) return { name: "Silver", textClass: "text-tier-silver", bgClass: "bg-secondary" };
  if (rating >= 45) return { name: "Bronze", textClass: "text-tier-bronze", bgClass: "bg-muted" };
  return { name: "Unranked", textClass: "text-muted-foreground", bgClass: "bg-muted" };
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
};

export function RatingBadge({ rating, size = "md", showTier = false, className }: RatingBadgeProps) {
  const tier = getRatingTier(rating);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-lg font-display font-bold text-primary-foreground shadow-lg",
          tier.bgClass,
          sizeClasses[size],
          rating >= 85 && "rating-glow"
        )}
      >
        {Math.round(rating)}
      </div>
      {showTier && (
        <span className={cn("text-xs font-medium", tier.textClass)}>
          {tier.name}
        </span>
      )}
    </div>
  );
}
