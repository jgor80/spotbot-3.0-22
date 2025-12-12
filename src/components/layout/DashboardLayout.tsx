import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Trophy, 
  Users, 
  ClipboardList, 
  User,
  Menu,
  X,
  Zap,
  Gamepad2,
  Swords,
  Target,
  Medal,
  UsersRound,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GuildSelector } from "@/components/GuildSelector";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/teams", label: "Teams", icon: UsersRound },
  { path: "/lineup", label: "Lineup", icon: ClipboardList },
  { path: "/drafts", label: "Drafts", icon: Swords },
  { path: "/scouting", label: "Scouting", icon: Target },
  { path: "/competitions", label: "Wins", icon: Medal },
  { path: "/profile", label: "Profile", icon: User },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hero">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">
              SquadIQ
            </span>
          </Link>

          {/* Guild Selector */}
          <div className="hidden md:block">
            <GuildSelector />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t bg-card p-4 animate-slide-up">
            <div className="mb-4">
              <GuildSelector />
            </div>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
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
