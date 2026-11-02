import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorNotice } from "@/components/fut/FutShared";
import { futApi, futKeys } from "@/lib/futApi";

/** Club sync: uploads the club file the XI Lab browser helper saved from the user's own EA Web App club. */
export function ClubImport() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [readError, setReadError] = useState<Error | null>(null);
  const sync = useMutation({
    mutationFn: futApi.importClub,
    onSuccess: () => { qc.invalidateQueries({ queryKey: futKeys.cards }); qc.invalidateQueries({ queryKey: futKeys.managers }); },
  });
  const onFile = async (file: File | undefined) => {
    setReadError(null); sync.reset();
    if (!file) return;
    try { sync.mutate(JSON.parse(await file.text())); }
    catch { setReadError(new Error("That file isn't a club file. In the XI Lab helper, use \"Download club file\".")); }
  };
  const r = sync.data;
  return <>
    <Button variant="outline" onClick={() => { setReadError(null); sync.reset(); setOpen(true); }}><Upload className="mr-2 h-4 w-4" />Sync club</Button>
    <Dialog open={open} onOpenChange={value => { if (!sync.isPending) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync your club</DialogTitle>
          <DialogDescription>Open your club in the EA Web App with the XI Lab helper installed, page through Players and Managers, then use "Download club file" and pick that file here. XI Lab never signs in to EA or touches your club.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="club-file">Club file (.json)</Label><Input id="club-file" type="file" accept="application/json,.json" disabled={sync.isPending} onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ""; }} /></div>
        <ErrorNotice error={readError ?? sync.error} />
        {sync.isPending && <p className="text-sm text-muted-foreground">Syncing…</p>}
        {r && <div className="space-y-2 text-sm">
          <p className="font-medium">{r.added} cards added, {r.updated} updated{r.managers_added ? `, ${r.managers_added} managers added` : ""}.</p>
          {!!r.prices_linked && <p>{r.prices_linked} captured prices now linked to your cards.</p>}
          {r.over_limit > 0 && <p>{r.over_limit} lower-rated cards were left out: you're at the card limit.</p>}
          {r.skipped.length > 0 && <p className="text-muted-foreground">Skipped: {r.skipped.map(s => `${s.count} ${s.reason}`).join(", ")}.</p>}
          <p className="text-xs text-muted-foreground">{r.note}</p>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
