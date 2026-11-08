import { FutDbError, type FutDb } from "./service.ts";

export async function futggStatus(db: FutDb, now = Date.now()) {
  const { data: source, error } = await db.from("market_price_sources").select("status").eq("id", "futgg_bulk").maybeSingle();
  if (error) throw new FutDbError(error.message);
  const enabled = source?.status === "enabled";
  const platforms = [];
  if (enabled) for (const platform of ["console", "pc"]) {
    const { data, error: readError } = await db.from("futgg_snapshots").select("*").eq("game_year", 27).eq("platform", platform).order("published_at", { ascending: false }).limit(1);
    if (readError) throw new FutDbError(readError.message);
    const row = data?.[0];
    const ageHours = row ? Math.max(0, (now - Date.parse(row.published_at)) / 3_600_000) : null;
    platforms.push({ platform, published_at: row?.published_at ?? null, received_at: row?.received_at ?? null, checked_at: row?.checked_at ?? null,
      card_count: row?.card_count ?? 0, market_price_count: row?.priced_count ?? 0,
      age_hours: ageHours === null ? null : Math.round(ageHours * 100) / 100,
      overdue: ageHours === null || ageHours > 12 });
  }
  let lastRun = null;
  if (enabled) {
    const { data, error: runError } = await db.from("market_provider_runs").select("finished_at,status,message").eq("source_id", "futgg_bulk").order("finished_at", { ascending: false }).limit(1);
    if (runError) throw new FutDbError(runError.message);
    lastRun = data?.[0] ?? null;
  }
  return { enabled, schedule: "06:00 and 18:00 UTC", platforms, last_run: lastRun,
    note: "Third-party FUT.GG bulk files. Publication time describes the dataset, not each card's last price check. Quotes are estimates; existing market freshness rules still apply. Coverage is limited to the files returned." };
}
