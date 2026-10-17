import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useDropPrerender } from "@/components/RouteMeta";

// Public legal pages. Discord requires a Terms of Service and Privacy Policy URL before an app
// can be monetized or listed in the App Directory, so these routes must stay outside ProtectedRoute.

// Shown on both pages. Set before pasting the URLs into the Discord Developer Portal.
export const LEGAL_CONTACT_EMAIL = "privacy@pennantbot.com";
export const LEGAL_UPDATED = "15 October 2026";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  useDropPrerender();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">GafferBot</Link>
        <h1 className="mt-1 text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1 [&_a]:text-primary [&_a]:underline">
          {children}
        </div>
        <nav className="mt-12 flex gap-4 border-t pt-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        </nav>
      </main>
    </div>
  );
}

export function ContactLink() {
  return <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;
}
