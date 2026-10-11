import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuildProvider } from "@/contexts/GuildContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Pages load on demand so the first visit only downloads the page being opened.
const Index = lazy(() => import("./pages/Index"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const LinkInvitePage = lazy(() => import("./pages/LinkInvitePage"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const DraftsPage = lazy(() => import("./pages/DraftsPage"));
const ScoutingPage = lazy(() => import("./pages/ScoutingPage"));
const ScoutingIntelPage = lazy(() => import("./pages/ScoutingIntelPage"));
const CompetitionsPage = lazy(() => import("./pages/CompetitionsPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const RatingsPage = lazy(() => import("./pages/RatingsPage"));
const RecentGamesPage = lazy(() => import("./pages/RecentGamesPage"));
const CabinetPage = lazy(() => import("./pages/CabinetPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const SquadIQPanel = lazy(() => import("./pages/SquadIQPanel"));
const ControlRoomPage = lazy(() => import("./pages/ControlRoomPage"));
const StreamOverlay = lazy(() => import("./pages/StreamOverlay"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Dark by default: managers mostly open this on match night
const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="gafferbot-theme">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GuildProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/link/:token" element={<LinkInvitePage />} />
                  {/* OBS browser source for /premium overlay: public, token in the URL */}
                  <Route path="/overlay/:token" element={<StreamOverlay />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
                  <Route path="/lineup" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/drafts" element={<ProtectedRoute><DraftsPage /></ProtectedRoute>} />
                  <Route path="/scouting" element={<ProtectedRoute><ScoutingPage /></ProtectedRoute>} />
                  <Route path="/scouting/intel" element={<ProtectedRoute><ScoutingIntelPage /></ProtectedRoute>} />
                  <Route path="/competitions" element={<ProtectedRoute><CompetitionsPage /></ProtectedRoute>} />
                  <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
                  <Route path="/ratings" element={<ProtectedRoute><RatingsPage /></ProtectedRoute>} />
                  <Route path="/games" element={<ProtectedRoute><RecentGamesPage /></ProtectedRoute>} />
                  <Route path="/insights" element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
                  <Route path="/squadiq" element={<ProtectedRoute><SquadIQPanel /></ProtectedRoute>} />
                  <Route path="/control" element={<ProtectedRoute><ControlRoomPage /></ProtectedRoute>} />
                  <Route path="/trophy-room" element={<ProtectedRoute><CabinetPage /></ProtectedRoute>} />
                  <Route path="/players" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </GuildProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
