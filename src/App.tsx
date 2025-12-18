import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuildProvider } from "@/contexts/GuildContext";
import Index from "./pages/Index";
import Leaderboard from "./pages/Leaderboard";
import LineupPage from "./pages/LineupPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import DraftsPage from "./pages/DraftsPage";
import ScoutingPage from "./pages/ScoutingPage";
import CompetitionsPage from "./pages/CompetitionsPage";
import TeamsPage from "./pages/TeamsPage";
import RatingsPage from "./pages/RatingsPage";
import RecentGamesPage from "./pages/RecentGamesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GuildProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/lineup" element={<LineupPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/drafts" element={<DraftsPage />} />
            <Route path="/scouting" element={<ScoutingPage />} />
            <Route path="/competitions" element={<CompetitionsPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/ratings" element={<RatingsPage />} />
            <Route path="/games" element={<RecentGamesPage />} />
            <Route path="/players" element={<Leaderboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </GuildProvider>
  </QueryClientProvider>
);

export default App;
