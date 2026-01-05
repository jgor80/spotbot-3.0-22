import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuildProvider } from "@/contexts/GuildContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import Leaderboard from "./pages/Leaderboard";
import LineupPage from "./pages/LineupPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import DraftsPage from "./pages/DraftsPage";
import ScoutingPage from "./pages/ScoutingPage";
import ScoutingIntelPage from "./pages/ScoutingIntelPage";
import CompetitionsPage from "./pages/CompetitionsPage";
import TeamsPage from "./pages/TeamsPage";
import RatingsPage from "./pages/RatingsPage";
import RecentGamesPage from "./pages/RecentGamesPage";
import SquadIQPanel from "./pages/SquadIQPanel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GuildProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
              <Route path="/lineup" element={<ProtectedRoute><LineupPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/drafts" element={<ProtectedRoute><DraftsPage /></ProtectedRoute>} />
              <Route path="/scouting" element={<ProtectedRoute><ScoutingPage /></ProtectedRoute>} />
              <Route path="/scouting/intel" element={<ProtectedRoute><ScoutingIntelPage /></ProtectedRoute>} />
              <Route path="/competitions" element={<ProtectedRoute><CompetitionsPage /></ProtectedRoute>} />
              <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
              <Route path="/ratings" element={<ProtectedRoute><RatingsPage /></ProtectedRoute>} />
              <Route path="/games" element={<ProtectedRoute><RecentGamesPage /></ProtectedRoute>} />
              <Route path="/squadiq" element={<ProtectedRoute><SquadIQPanel /></ProtectedRoute>} />
              <Route path="/players" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </GuildProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
