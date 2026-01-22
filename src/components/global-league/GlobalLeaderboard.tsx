import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Search, Building2, Users } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  useGlobalClubsLeaderboard,
  useGlobalDiscordsLeaderboard,
  flattenClubsPages,
  flattenDiscordsPages,
} from "@/hooks/useGlobalLeaderboard";
import { VirtualClubsTable } from "./VirtualClubsTable";
import { VirtualDiscordsTable } from "./VirtualDiscordsTable";

const PLATFORMS = [
  { value: "all", label: "All Platforms" },
  { value: "ps5", label: "PlayStation" },
  { value: "xbox-series-xs", label: "Xbox" },
  { value: "pc", label: "PC" },
];

export function GlobalLeaderboard() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [view, setView] = useState<"clubs" | "discord">("clubs");

  // Debounce search input by 300ms
  const debouncedSearch = useDebouncedValue(search, 300);

  // Infinite queries for clubs and discords
  const clubsQuery = useGlobalClubsLeaderboard(platform, debouncedSearch, view === "clubs");
  const discordsQuery = useGlobalDiscordsLeaderboard(platform, debouncedSearch, view === "discord");

  const clubs = flattenClubsPages(clubsQuery.data?.pages);
  const discords = flattenDiscordsPages(discordsQuery.data?.pages);

  const isLoading = view === "clubs" ? clubsQuery.isLoading : discordsQuery.isLoading;
  const total = view === "clubs" 
    ? clubsQuery.data?.pages[0]?.total 
    : discordsQuery.data?.pages[0]?.total;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Global Rankings
            {total !== undefined && (
              <span className="text-sm font-normal text-muted-foreground">
                ({total} {view === "clubs" ? "clubs" : "servers"})
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as "clubs" | "discord")} className="w-auto">
              <TabsList className="h-9">
                <TabsTrigger value="clubs" className="gap-1.5 text-xs">
                  <Building2 className="h-3.5 w-3.5" />
                  Clubs
                </TabsTrigger>
                <TabsTrigger value="discord" className="gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  Discords
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={view === "clubs" ? "Search clubs..." : "Search servers..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[180px]"
              />
            </div>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : view === "clubs" ? (
          <VirtualClubsTable
            clubs={clubs}
            hasNextPage={!!clubsQuery.hasNextPage}
            isFetchingNextPage={clubsQuery.isFetchingNextPage}
            fetchNextPage={clubsQuery.fetchNextPage}
          />
        ) : (
          <VirtualDiscordsTable
            discords={discords}
            hasNextPage={!!discordsQuery.hasNextPage}
            isFetchingNextPage={discordsQuery.isFetchingNextPage}
            fetchNextPage={discordsQuery.fetchNextPage}
          />
        )}
      </CardContent>
    </Card>
  );
}
