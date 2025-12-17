import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tv } from "lucide-react";

interface TwitchStreamer {
  username: string;
  displayName: string;
  isLive: boolean;
  game?: string;
  viewers?: number;
}

// Hardcoded Rush Superstars TV streamers - easy to add/remove
const TWITCH_STREAMERS: TwitchStreamer[] = [
  { username: "bmac0721", displayName: "bmac0721", isLive: false },
  { username: "wiley_hupertz", displayName: "wiley_hupertz", isLive: false },
  { username: "xtwentytwoov", displayName: "xtwentytwoov", isLive: true, game: "EA Sports FC 26", viewers: 1 },
  { username: "rushsuperstars", displayName: "rushsuperstars", isLive: false },
  { username: "spgreer", displayName: "spgreer", isLive: false },
  { username: "sevenreturns", displayName: "sevenreturns", isLive: false },
  { username: "airdangus23", displayName: "airdangus23", isLive: false },
  { username: "acevill", displayName: "acevill", isLive: true, game: "EA Sports FC 26", viewers: 3 },
  { username: "askii22", displayName: "askii22", isLive: false },
  { username: "keepcomposure", displayName: "keepcomposure", isLive: false },
];

export function TwitchStreamers() {
  const liveStreamers = TWITCH_STREAMERS.filter(s => s.isLive);
  const offlineStreamers = TWITCH_STREAMERS.filter(s => !s.isLive);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Tv className="h-5 w-5 text-[#9146FF]" />
          Rush Superstars TV
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Live streamers first */}
        {liveStreamers.map((streamer) => (
          <a
            key={streamer.username}
            href={`https://twitch.tv/${streamer.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
              </div>
              <span className="font-medium text-sm">{streamer.displayName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="text-xs">
                LIVE
              </Badge>
              {streamer.viewers !== undefined && (
                <span className="text-xs text-muted-foreground">{streamer.viewers}</span>
              )}
            </div>
          </a>
        ))}

        {/* Offline streamers */}
        {offlineStreamers.map((streamer) => (
          <a
            key={streamer.username}
            href={`https://twitch.tv/${streamer.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
              <span className="text-sm text-muted-foreground">{streamer.displayName}</span>
            </div>
            <span className="text-xs text-muted-foreground">Offline</span>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
