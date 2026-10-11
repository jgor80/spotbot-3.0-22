import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Trophy,
  User,
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
  ChevronDown,
  MoreHorizontal,
  Moon,
  Sun,
  Medal,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GuildSelector } from "@/components/GuildSelector";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardLayoutProps {
  children: ReactNode;
}

// The four views a manager uses on match night
const primaryNavItems = [
  { path: "/", label: "Match Night", short: "Match", icon: LayoutDashboard },
  { path: "/teams", label: "Lineup Builder", short: "Lineup", icon: UsersRound },
  { path: "/leaderboard", label: "Club Stats", short: "Stats", icon: Trophy },
  { path: "/insights", label: "Tactical Insights", short: "Insights", icon: Lightbulb },
];

const moreNavItems = [
  { path: "/control", label: "Control Room", icon: SlidersHorizontal },
  { path: "/games", label: "Games", icon: Gamepad2 },
  { path: "/trophy-room", label: "Trophy Room", icon: Medal },
  { path: "/ratings", label: "Ratings", icon: Star },
  { path: "/drafts", label: "Drafts", icon: Swords },
  { path: "/scouting", label: "Scouting", icon: Target },
  { path: "/competitions", label: "Wins", icon: Medal },
  { path: "/squadiq", label: "Bot Panel", icon: MessageSquare },
  { path: "/profile", label: "Profile", icon: User },
  { path: "/settings", label: "Settings", icon: Settings },
];

// /lineup is an alias of /teams and /players of /leaderboard
const ALIASES: Record<string, string> = { "/lineup": "/teams", "/players": "/leaderboard" };

function isActivePath(current: string, path: string) {
  const resolved = ALIASES[current] ?? current;
  return path === "/" ? resolved === "/" : resolved === path || resolved.startsWith(path + "/");
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const moreActive = moreNavItems.some((item) => isActivePath(location.pathname, item.path));

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-lg">
        <div className="container flex h-14 items-center gap-3 px-4 sm:px-6 md:h-16 md:gap-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero shadow-sm">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="hidden font-display text-xl font-bold tracking-tight sm:inline">GafferBot</span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {primaryNavItems.map((item) => {
              const active = isActivePath(location.pathname, item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                  {item.label}
                  {active && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-primary" />}
                </Link>
              );
            })}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none",
                  moreActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                More
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
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
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <GuildSelector className="h-9 w-auto min-w-0 max-w-[190px] sm:max-w-[240px]" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label="Account">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                    {user?.email?.[0] ?? "?"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center gap-2">
                    <User className="h-4 w-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleTheme} className="flex items-center gap-2">
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {isDark ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut} className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Bottom padding keeps content clear of the mobile tab bar */}
      <main className="container px-4 pb-28 pt-5 sm:px-6 md:pt-8 lg:px-8 lg:pb-12">{children}</main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-lg lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {primaryNavItems.map((item) => {
            const active = isActivePath(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.short}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              moreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {moreNavItems.map((item) => {
              const active = isActivePath(location.pathname, item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl p-3 text-xs font-medium transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2 border-t pt-4">
            <Button variant="outline" className="flex-1" onClick={toggleTheme}>
              {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              {isDark ? "Light mode" : "Dark mode"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Shared page heading so every view lines up the same way
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold leading-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
