import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DiscordIcon } from "@/components/DiscordIcon";
import { discordAuthApi } from "@/lib/discordAuthApi";
import { cn } from "@/lib/utils";
import { GUIDES, THE_SPOT_PATH } from "@/content/guides";

// Shared by the public pages (landing, guides, FAQ): the Add to Discord button, header and footer.
// Rendered at build time by scripts/prerender.mjs, so browser-only code stays in effects.

// View channels, send/embed/attach, read history, reactions, external emoji, mention roles,
// manage messages (sticky panels), manage roles (positions, trophies), change nickname,
// create invites (recruiting), public threads and sending in threads,
// manage channels + connect + move members (Social Hub lobbies and Casual Play voice moves).
export const BOT_PERMISSIONS = "309591534673";

// GafferBot is free; this is where people can chip in to keep it running
export const DONATE_URL = "https://venmo.com/u/bleacherjeff";

export function useInviteUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    discordAuthApi<{ client_id: string | null }>().then(({ data }) => {
      if (!live || !data?.client_id) return;
      const params = new URLSearchParams({
        client_id: data.client_id,
        scope: "bot applications.commands",
        permissions: BOT_PERMISSIONS,
      });
      setUrl(`https://discord.com/oauth2/authorize?${params}`);
    });
    return () => {
      live = false;
    };
  }, []);
  return url;
}

export function AddToDiscord({ url, size = "lg", className }: { url: string | null; size?: "lg" | "default"; className?: string }) {
  // Until the client id loads (or if it can't), send people to sign in, where Discord sign-in still works
  return (
    <Button asChild size={size} className={cn("font-semibold", size === "lg" && "h-12 px-6 text-base", className)}>
      <a href={url ?? "/auth"}>
        <DiscordIcon className="mr-2 h-5 w-5" />
        Add to Discord
      </a>
    </Button>
  );
}

export function PublicHeader({ inviteUrl, children }: { inviteUrl: string | null; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/badge-128.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0" />
          <span className="font-display text-xl font-bold">GafferBot</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {children ?? (
            <>
              <Link to="/guides" className="hover:text-foreground">Guides</Link>
              <Link to="/faq" className="hover:text-foreground">FAQ</Link>
              <Link to={THE_SPOT_PATH} className="hover:text-foreground">Find a game</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <AddToDiscord url={inviteUrl} size="default" className="hidden sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}

// Every public page links every guide: crawlers find them all and each one gets internal links.
export function PublicFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted-foreground sm:grid-cols-3">
        <div>
          <p className="font-semibold text-foreground">Guides</p>
          <ul className="mt-3 space-y-2">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link to={`/${g.slug}`} className="hover:text-foreground">{g.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground">GafferBot</p>
          <ul className="mt-3 space-y-2">
            <li><Link to="/" className="hover:text-foreground">Home</Link></li>
            <li><Link to="/guides" className="hover:text-foreground">All guides</Link></li>
            <li><Link to="/faq" className="hover:text-foreground">FAQ</Link></li>
            <li><Link to={THE_SPOT_PATH} className="hover:text-foreground">The Spot: Pro Clubs pickup server</Link></li>
            <li><Link to="/auth" className="hover:text-foreground">Sign in</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground">About</p>
          <ul className="mt-3 space-y-2">
            <li><Link to="/terms" className="hover:text-foreground">Terms of Service</Link></li>
            <li><Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
            <li><a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Donate</a></li>
          </ul>
          <p className="mt-6">© {new Date().getFullYear()} GafferBot. Not affiliated with Electronic Arts or Discord.</p>
        </div>
      </div>
    </footer>
  );
}
