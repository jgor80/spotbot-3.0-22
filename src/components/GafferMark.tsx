import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// The GafferBot logo: a bolt on the green gradient tile (same as public/favicon.svg)
export function GafferMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span className={cn("flex items-center justify-center rounded-lg bg-gradient-hero shadow-sm", className)}>
      <Zap className={cn("h-1/2 w-1/2 fill-[#06130c] text-[#06130c]", iconClassName)} aria-hidden="true" />
    </span>
  );
}
