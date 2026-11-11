import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Trophy, CalendarClock, LineChart,
  User,
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
  CreditCard,
  Newspaper,
  Gift,
  Search,
  UserSearch,
  ChartNoAxesCombined,
  FlaskConical,
  Layers,
  Package,
  Wallet,
  Shield,
  Puzzle,
  BookOpenText,
  TrendingUp,
  Coins,
  Scale,
  Gauge,
  Columns3,
  type LucideIcon,
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

type NavItem = { path: string; label: string; short?: string; icon: LucideIcon };
type AppSection = "club" | "fut";

// Club app: the four views a manager uses on match night
const clubPrimary: NavItem[] = [
  { path: "/", label: "Match Night", short: "Match", icon: LayoutDashboard },
  { path: "/teams", label: "Lineup Builder", short: "Lineup", icon: UsersRound },
  { path: "/leaderboard", label: "Club Stats", short: "Stats", icon: Trophy },
  { path: "/insights", label: "Tactical Insights", short: "Insights", icon: Lightbulb },
];

const clubMore: NavItem[] = [
  { path: "/control", label: "Control Room", icon: SlidersHorizontal },
  { path: "/games", label: "Games", icon: Gamepad2 },
  { path: "/trophy-room", label: "Trophy Room", icon: Medal },
  { path: "/paper", label: "The Paper", icon: Newspaper },
  { path: "/wrapped", label: "Club Wrapped", icon: Gift },
  { path: "/billing", label: "Plans & AI Images", icon: CreditCard },
  { path: "/ratings", label: "Ratings", icon: Star },
  { path: "/drafts", label: "Drafts", icon: Swords },
  { path: "/scouting", label: "Scouting", icon: Target },
  { path: "/competitions", label: "Wins", icon: Medal },
  { path: "/squadiq", label: "Bot Panel", icon: MessageSquare },
  { path: "/profile", label: "Profile", icon: User },
  { path: "/settings", label: "Settings", icon: Settings },
];

// FUT app: Ultimate Team market and squad tools. Personal, not tied to a Discord club.
const futPrimary: NavItem[] = [
  { path: "/fut/market/cards", label: "Card Search", short: "Search", icon: Search },
  { path: "/fut/players", label: "Player Ratings", short: "Ratings", icon: UserSearch },
  { path: "/fut/market", label: "Market Lab", short: "Market", icon: ChartNoAxesCombined },
  { path: "/fut", label: "Squad Builder", short: "Squads", icon: FlaskConical },
  { path: "/fut/cards", label: "My Cards", short: "Cards", icon: Layers },
];

// Five in the bar keeps the phone nav readable; the rest sit under More
const futMore: NavItem[] = [
  { path: "/fut/strategy", label: "Daily Strategy", icon: Target },
  { path: "/fut/account", label: "My Account", icon: Wallet },
  { path: "/fut/packs", label: "Packs", icon: Package },
  { path: "/fut/sbc", label: "SBC Solver", icon: Puzzle },
  { path: "/fut/knowledge", label: "Knowledge Bank", icon: BookOpenText },
  { path: "/fut/evolutions", label: "Evolutions", icon: TrendingUp },
  { path: "/fut/trades", label: "Trade Log", icon: Coins },
  { path: "/fut/sell", label: "Sell or Keep", icon: Scale },
  { path: "/fut/meta", label: "Meta Ratings", icon: Gauge },
  { path: "/fut/compare", label: "Compare Cards", icon: Columns3 },
  { path: "/fut/champs", label: "Champs Tracker", icon: Trophy },
  { path: "/fut/calendar", label: "Market Calendar", icon: CalendarClock },
  { path: "/fut/fodder", label: "Fodder Index", icon: LineChart },
];

const SECTION_HOME: Record<AppSection, string> = { club: "/", fut: "/fut/market/cards" };
const LAST_PATH_KEY = "gafferbot-last-path-";

function sectionOf(path: string): AppSection {
  return path === "/fut" || path.startsWith("/fut/") ? "fut" : "club";
}

// /lineup is an alias of /teams and /players of /leaderboard
const ALIASES: Record<string, string> = { "/lineup": "/teams", "/players": "/leaderboard" };

// The nav item with the longest path that contains the current page, so /fut/market/cards
// lights up Card Search and not Market Lab or Squad Builder.
function activeNavPath(current: string, items: NavItem[]) {
  const resolved = ALIASES[current] ?? current;
  let best: string | null = null;
  for (const { path } of items) {
    const hit = path === "/" ? resolved === "/" : resolved === path || resolved.startsWith(path + "/");
    if (hit && (!best || path.length > best.length)) best = path;
  }
  return best;
}

function rememberPath(section: AppSection, path: string) {
  try { sessionStorage.setItem(LAST_PATH_KEY + section, path); } catch { /* storage blocked: the switch falls back to the section home */ }
}
function lastPath(section: AppSection) {
  try {
    const saved = sessionStorage.getItem(LAST_PATH_KEY + section);
    if (saved && sectionOf(saved) === section) return saved;
  } catch { /* storage blocked */ }
  return SECTION_HOME[section];
}

// Club / FUT switch: the two halves of GafferBot, each with its own nav and colour
function SectionSwitch({ section }: { section: AppSection }) {
  const options: { key: AppSection; label: string; icon: LucideIcon }[] = [
    { key: "club", label: "Club", icon: Shield },
    { key: "fut", label: "FUT", icon: Layers },
  ];
  return (
    <div role="tablist" aria-label="App section" className="flex shrink-0 items-center rounded-full border border-border/70 bg-muted/50 p-0.5">
      {options.map((option) => {
        const active = option.key === section;
        return (
          <Link
            key={option.key}
            role="tab"
            aria-selected={active}
            to={active ? SECTION_HOME[option.key] : lastPath(option.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
              active
                ? option.key === "fut"
                  ? "bg-fut text-fut-foreground shadow-sm"
                  : "bg-club text-club-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <option.icon className="h-3.5 w-3.5" />
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const section = sectionOf(location.pathname);
  const primaryNavItems = section === "fut" ? futPrimary : clubPrimary;
  const moreNavItems = section === "fut" ? futMore : clubMore;
  const activePath = activeNavPath(location.pathname, [...primaryNavItems, ...moreNavItems]);
  const moreActive = moreNavItems.some((item) => item.path === activePath);

  // FUT pages swap the brand colour from pitch green to gold, including dialogs and menus
  // that render outside this layout, so the two halves of the app never look alike.
  useEffect(() => {
    rememberPath(section, location.pathname + location.search);
    const root = document.documentElement;
    root.dataset.app = section;
    return () => { delete root.dataset.app; };
  }, [section, location.pathname, location.search]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-lg">
        <div className="container flex h-14 items-center gap-3 px-4 sm:px-6 md:h-16 md:gap-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link to={SECTION_HOME[section]} className="flex shrink-0 items-center gap-2">
              <img src="/brand/badge-128.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0" />
              <span className="hidden font-display text-xl font-bold tracking-tight sm:inline lg:hidden xl:inline">
                GafferBot{section === "fut" && <span className="text-primary"> FUT</span>}
              </span>
            </Link>
            <SectionSwitch section={section} />
          </div>

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {primaryNavItems.map((item) => {
              const active = item.path === activePath;
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
            {moreNavItems.length > 0 && <DropdownMenu>
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
            </DropdownMenu>}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {/* FUT tools are personal, so the Discord server picker only shows in the Club app */}
            {section === "club" && <GuildSelector className="h-9 w-auto min-w-0 max-w-[190px] sm:max-w-[240px]" />}
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
        <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${primaryNavItems.length + 1}, minmax(0, 1fr))` }}>
          {primaryNavItems.map((item) => {
            const active = item.path === activePath;
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
            <SheetTitle>{section === "fut" ? "GafferBot FUT" : "More"}</SheetTitle>
          </SheetHeader>
          {moreNavItems.length > 0 && <div className="mt-4 grid grid-cols-4 gap-2">
            {moreNavItems.map((item) => {
              const active = item.path === activePath;
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
          </div>}
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
