import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuildProvider } from "@/contexts/GuildContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RouteMeta } from "@/components/RouteMeta";
import { useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Pages load on demand so the first visit only downloads the page being opened.
const Index = lazy(() => import("./pages/Index"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
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
const NewspaperPage = lazy(() => import("./pages/NewspaperPage"));
const WrappedPage = lazy(() => import("./pages/WrappedPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const SquadIQPanel = lazy(() => import("./pages/SquadIQPanel"));
const ControlRoomPage = lazy(() => import("./pages/ControlRoomPage"));
const StreamOverlay = lazy(() => import("./pages/StreamOverlay"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FutHomePage = lazy(() => import("./pages/fut/FutHomePage"));
const FutSquadPage = lazy(() => import("./pages/fut/FutSquadPage"));
const FutCardsPage = lazy(() => import("./pages/fut/FutCardsPage"));
const MarketOverviewPage = lazy(() => import("./pages/fut/market/MarketOverviewPage"));
const MarketRadarPage = lazy(() => import("./pages/fut/market/MarketRadarPage"));
const MarketCardsPage = lazy(() => import("./pages/fut/market/MarketCardsPage"));
const MarketCardPage = lazy(() => import("./pages/fut/market/MarketCardPage"));
const MarketWatchlistPage = lazy(() => import("./pages/fut/market/MarketWatchlistPage"));
const MarketImportPage = lazy(() => import("./pages/fut/market/MarketImportPage"));
const MarketSourcesPage = lazy(() => import("./pages/fut/market/MarketSourcesPage"));
const PackAdvisorPage = lazy(() => import("./pages/fut/PackAdvisorPage"));
const PlayerRatingsPage = lazy(() => import("./pages/fut/PlayerRatingsPage"));
const FutAccountPage = lazy(() => import("./pages/fut/FutAccountPage"));
const FutStrategyPage = lazy(() => import("./pages/fut/FutStrategyPage"));
const SbcSolverPage = lazy(() => import("./pages/fut/SbcSolverPage"));
const KnowledgePage = lazy(() => import("./pages/fut/KnowledgePage"));
const EvolutionsPage = lazy(() => import("./pages/fut/EvolutionsPage"));
const TradesPage = lazy(() => import("./pages/fut/TradesPage"));
const SellOrKeepPage = lazy(() => import("./pages/fut/SellOrKeepPage"));
const MetaRatingsPage = lazy(() => import("./pages/fut/MetaRatingsPage"));
const CardComparePage = lazy(() => import("./pages/fut/CardComparePage"));
const ChampsTrackerPage = lazy(() => import("./pages/fut/ChampsTrackerPage"));
const MarketCalendarPage = lazy(() => import("./pages/fut/MarketCalendarPage"));
const FodderIndexPage = lazy(() => import("./pages/fut/FodderIndexPage"));
const ObjectivesPlannerPage = lazy(() => import("./pages/fut/ObjectivesPlannerPage"));

const queryClient = new QueryClient();
// Market Lab data changes when FUT.GG refreshes (twice a day) or you import prices (which refetches it), so keep it
// for a few minutes instead of reloading it on every page and every return to the tab.
queryClient.setQueryDefaults(["fut", "market"], { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false });

const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Signed-out visitors (and search engines) get the landing page; signed-in users keep their club dashboard.
const HomeRoute = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoading />;
  return user ? <Index /> : <LandingPage />;
};

// Dark by default: managers mostly open this on match night
const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="gafferbot-theme">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GuildProvider>
          <TooltipProvider>
            <Toaster />
            <BrowserRouter>
              <RouteMeta />
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/link/:token" element={<LinkInvitePage />} />
                  {/* OBS browser source for /premium overlay: public, token in the URL */}
                  <Route path="/overlay/:token" element={<StreamOverlay />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/welcome" element={<LandingPage />} />
                  <Route path="/" element={<HomeRoute />} />
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
                  <Route path="/paper" element={<ProtectedRoute><NewspaperPage /></ProtectedRoute>} />
                  <Route path="/wrapped" element={<ProtectedRoute><WrappedPage /></ProtectedRoute>} />
                  <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
                  <Route path="/players" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
                  <Route path="/fut" element={<ProtectedRoute><FutHomePage /></ProtectedRoute>} />
                  <Route path="/fut/squads/:id" element={<ProtectedRoute><FutSquadPage /></ProtectedRoute>} />
                  <Route path="/fut/cards" element={<ProtectedRoute><FutCardsPage /></ProtectedRoute>} />
                  <Route path="/fut/market" element={<ProtectedRoute><MarketOverviewPage /></ProtectedRoute>} />
                  <Route path="/fut/market/cards" element={<ProtectedRoute><MarketCardsPage /></ProtectedRoute>} />
                  <Route path="/fut/market/radar" element={<ProtectedRoute><MarketRadarPage /></ProtectedRoute>} />
                  <Route path="/fut/market/card/:id" element={<ProtectedRoute><MarketCardPage /></ProtectedRoute>} />
                  <Route path="/fut/market/watchlist" element={<ProtectedRoute><MarketWatchlistPage /></ProtectedRoute>} />
                  <Route path="/fut/market/import" element={<ProtectedRoute><MarketImportPage /></ProtectedRoute>} />
                  <Route path="/fut/market/sources" element={<ProtectedRoute><MarketSourcesPage /></ProtectedRoute>} />
                  <Route path="/fut/packs" element={<ProtectedRoute><PackAdvisorPage /></ProtectedRoute>} />
                  <Route path="/fut/players" element={<ProtectedRoute><PlayerRatingsPage /></ProtectedRoute>} />
                  <Route path="/fut/account" element={<ProtectedRoute><FutAccountPage /></ProtectedRoute>} />
                  <Route path="/fut/strategy" element={<ProtectedRoute><FutStrategyPage /></ProtectedRoute>} />
                  <Route path="/fut/sbc" element={<ProtectedRoute><SbcSolverPage /></ProtectedRoute>} />
                  <Route path="/fut/knowledge" element={<ProtectedRoute><KnowledgePage /></ProtectedRoute>} />
                  <Route path="/fut/evolutions" element={<ProtectedRoute><EvolutionsPage /></ProtectedRoute>} />
                  <Route path="/fut/trades" element={<ProtectedRoute><TradesPage /></ProtectedRoute>} />
                  <Route path="/fut/sell" element={<ProtectedRoute><SellOrKeepPage /></ProtectedRoute>} />
                  <Route path="/fut/meta" element={<ProtectedRoute><MetaRatingsPage /></ProtectedRoute>} />
                  <Route path="/fut/compare" element={<ProtectedRoute><CardComparePage /></ProtectedRoute>} />
                  <Route path="/fut/champs" element={<ProtectedRoute><ChampsTrackerPage /></ProtectedRoute>} />
                  <Route path="/fut/calendar" element={<ProtectedRoute><MarketCalendarPage /></ProtectedRoute>} />
                  <Route path="/fut/fodder" element={<ProtectedRoute><FodderIndexPage /></ProtectedRoute>} />
                  <Route path="/fut/objectives" element={<ProtectedRoute><ObjectivesPlannerPage /></ProtectedRoute>} />
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
