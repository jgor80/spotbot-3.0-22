import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, EyeOff, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { HelperDownload } from "@/components/fut/HelperDownload";
import { toast } from "@/lib/notify";

const helperKey = [...futKeys.market, "helper"];
const fullKey = [...futKeys.market, "helper", "key"];

/** Connect the XI Lab browser helper: status, the full key (show / copy), new key, turn off. Used on the profile
 * and on Market Lab → Import prices. */
export function HelperConnection({ showDownload = true }: { showDownload?: boolean }) {
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);
  const status = useQuery({ queryKey: helperKey, queryFn: futApi.market.helper });
  const key = useQuery({ queryKey: fullKey, queryFn: futApi.market.helperKey, enabled: !!status.data?.connected });
  const refresh = () => { void qc.invalidateQueries({ queryKey: helperKey }); };
  const connect = useMutation({ mutationFn: futApi.market.connectHelper, onSuccess: () => { setShown(true); refresh(); } });
  const disconnect = useMutation({ mutationFn: futApi.market.disconnectHelper, onSuccess: () => { connect.reset(); setShown(false); refresh(); } });
  // A just-made key is in the connect answer; otherwise the saved one (null for keys made before they were kept).
  const value = connect.data?.key ?? key.data?.key ?? null;
  const connected = !!status.data?.connected;
  const copy = async () => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success("Helper key copied"); } catch { setShown(true); toast.error("Couldn't copy. Select the key and copy it by hand."); }
  };
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">The XI Lab helper sends the prices it records, your club, the pack store and your account straight to GafferBot while you use the EA FC Web App. Its key can only upload those: it can't read your squads, cards or prices. Making a new key turns the old one off.</p>
    {showDownload && <HelperDownload />}
    {status.data && <p className="text-sm">{connected ? <>Connected (key ending {status.data.key_hint}). {status.data.last_used_at ? `Last upload ${new Date(status.data.last_used_at).toLocaleString()}.` : "No uploads yet."}</> : "Not connected."}</p>}
    {connected && value && <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Your helper key. Paste it into the helper's Gaffer Bot section, then Save. Keep it private.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs select-all">{shown ? value : `${value.slice(0, 4)}${"•".repeat(16)}${value.slice(-4)}`}</code>
        <Button size="sm" variant="ghost" aria-label={shown ? "Hide key" : "Show key"} onClick={() => setShown(s => !s)}>{shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
        <Button size="sm" variant="ghost" aria-label="Copy key" onClick={() => void copy()}><Copy className="h-4 w-4" /></Button>
      </div>
    </div>}
    {connected && !value && key.isSuccess && <p className="text-sm text-muted-foreground">This key was made before GafferBot could show keys again. Press New key to get one you can see here any time, then paste it into the helper.</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={connect.isPending || status.isPending} onClick={() => { if (!connected || window.confirm("Make a new key? The helper stops uploading until you paste the new key into it.")) connect.mutate(); }}><Link2 className="mr-2 h-4 w-4" />{connect.isPending ? "Making a key…" : connected ? "New key" : "Connect helper"}</Button>
      {connected && <Button variant="outline" disabled={disconnect.isPending} onClick={() => { if (window.confirm("Turn off the helper's key? It stops uploading.")) disconnect.mutate(); }}><Unlink className="mr-2 h-4 w-4" />Turn off</Button>}
    </div>
    <ErrorNotice error={status.error || key.error || connect.error || disconnect.error} />
  </div>;
}
