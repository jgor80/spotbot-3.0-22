import { useState, useEffect } from "react";
import { ClubProfileCard } from "./ClubProfileCard";
import { GlobalClub } from "@/hooks/useGlobalLeaderboard";

interface LazyClubProfileCardProps {
  club: GlobalClub;
}

export function LazyClubProfileCard({ club }: LazyClubProfileCardProps) {
  const [showCard, setShowCard] = useState(false);

  // Delay showing the card by 500ms to avoid flicker on quick hovers
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowCard(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (!showCard) return null;

  return (
    <div className="absolute left-0 top-full mt-2 z-50">
      <ClubProfileCard club={club} />
    </div>
  );
}
