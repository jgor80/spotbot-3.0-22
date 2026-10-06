import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  Trophy, 
  Users, 
  User,
  Menu,
  X,
  Zap,
  Gamepad2,
  Swords,
  Target,
  UsersRound,
  Settings,
  Star,
  MessageSquare,
  LogOut,
  Lightbulb,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GuildSelector } from "@/components/GuildSelector";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardLayoutProps {
  children: ReactNode;
}

// The four views a manager uses on match night
const primaryNavItems = [
  { path: "/", label: "Match Night", icon: LayoutDashboard },
  { path: "/teams", label: "Lineup Builder", icon: UsersRound },
  { path: "/leaderboard", label: "Club Stats", icon: Trophy },
  { path: "/insights", label: "Tactical Insights", icon: Lightbulb },
];

const moreNavItems = [
  { path: "/games", label: "Games", icon: Gamepad2 },
  { path: "/ratings", label: "Ratings", icon: Star },
  { path: "/drafts", label: "Drafts", icon: Swords },
  { path: "/scouting", label: "Scouting", icon: Target },
  { path: "/squadiq", label: "SquadIQ", icon: MessageSquare },
  { path: "/competitions", label: "Wins", icon: Trophy },
  { path: "/profile", label: "Profile", icon: User },
  { path: "/settings", label: "Settings", icon: Settings },
];

const navLinkClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-muted"
  );

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b">
        {/* Top row: Logo, Guild Selector, Mobile Menu */}
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              SquadIQ
            </span>
          </Link>

          {/* Guild Selector + User Info - visible on tablet+ */}
          <div className="hidden sm:flex items-center gap-3">
            <GuildSelector />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="max-w-[150px] truncate">{user?.email}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Desktop Navigation - wraps into multiple rows */}
        <nav className="hidden lg:block container pb-2">
          <div className="flex flex-wrap items-center gap-1">
            {primaryNavItems.map((item) => (
              <Link key={item.path} to={item.path} className={navLinkClass(location.pathname === item.path)}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={navLinkClass(moreNavItems.some((item) => item.path === location.pathname))}
              >
                More
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {moreNavItems.map((item) => (
                  <DropdownMenuItem key={item.path} asChild>
                    <Link to={item.path} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="lg:hidden border-t bg-card p-4 animate-slide-up">
            <div className="mb-4 sm:hidden">
              <GuildSelector />
            </div>
            {[primaryNavItems, moreNavItems].map((group, i) => (
              <div key={i} className={cn("flex flex-wrap gap-2", i > 0 && "mt-3 pt-3 border-t")}>
                {group.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass(location.pathname === item.path)}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate max-w-[200px]">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="container py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
