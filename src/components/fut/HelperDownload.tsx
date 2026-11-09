import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HELPER_VERSION } from "@/components/fut/helperVersion";

/** Download link and install steps for the XI Lab helper (Chrome extension, public/downloads/xi-lab-helper.zip). */
export function HelperDownload({ compact = false }: { compact?: boolean }) {
  return <div className="space-y-2">
    <Button asChild variant="outline" size={compact ? "sm" : "default"}>
      <a href="/downloads/xi-lab-helper.zip" download="xi-lab-helper.zip"><Download className="mr-2 h-4 w-4" />Download helper (v{HELPER_VERSION})</a>
    </Button>
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">How to install it</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Unzip <span className="font-mono text-xs">xi-lab-helper.zip</span> into a folder you'll keep (Chrome loads it from there).</li>
        <li>In Chrome (or Edge, Brave), open <span className="font-mono text-xs">chrome://extensions</span> and turn on <strong>Developer mode</strong>.</li>
        <li>Click <strong>Load unpacked</strong> and pick the unzipped folder.</li>
        <li>Connect it: <strong>Market Lab → Import prices → Connect helper</strong>, then paste the key into the helper's Gaffer Bot section and save.</li>
        <li>Open your club in the EA FC Web App and page through Players. The helper uploads your club and the prices you see. Open Store → Packs (and each pack's odds) for Pack Advisor.</li>
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">To update, download it again, replace the folder's files and press the reload button on the extension. It never bids, buys, lists or signs in for you.</p>
    </details>
  </div>;
}
